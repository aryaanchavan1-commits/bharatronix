import crypto from "crypto";
import { db } from "@/db";
import {
  orders,
  payments,
  fraudEvents,
  encryptionKeys,
  type Order,
  type Payment,
} from "@/db/schema";
import {
  eq,
  and,
  sql,
  desc,
  count,
  sum,
} from "drizzle-orm";
import {
  BIN_ROUTING_STRATEGIES,
  HIGH_RISK_COUNTRIES,
  GEO_MATCH_THRESHOLD,
  WEBHOOK_DESTINATIONS,
  ENCRYPTION_KEY_CIPHER,
  ENCRYPTION_KEY_SCHEDULE_DAYS,
} from "./fraud-config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

// ---------------------------------------------------------------------------
// Encryption key management
// ---------------------------------------------------------------------------

async function getEncryptionKey(keyVersion: number): Promise<Buffer | null> {
  try {
    const results = await db
      .select()
      .from(encryptionKeys)
      .where(eq(encryptionKeys.keyVersion, keyVersion))
      .limit(1);
    const keyRecord = results[0];
    if (!keyRecord?.keyMaterial) return null;
    return Buffer.from(keyRecord.keyMaterial, "hex");
  } catch {
    return null;
  }
}

let cachedKeyVersion: number | null = null;

export function getCurrentKeyVersion(): number {
  if (cachedKeyVersion !== null) return cachedKeyVersion;
  
  // Fallback - can't await in non-async function, use cached value
  return cachedKeyVersion ?? 1;
}

export async function refreshKeyVersionCache(): Promise<void> {
  try {
    const results = await db
      .select()
      .from(encryptionKeys)
      .where(eq(encryptionKeys.isPrimary, true))
      .limit(1);
    cachedKeyVersion = results[0]?.keyVersion ?? 1;
  } catch {
    cachedKeyVersion = 1;
  }
}

export async function initializeEncryptionKeys(): Promise<void> {
  const existing = await db.select().from(encryptionKeys).limit(1);
  if (existing && existing.length > 0) return;

  // Generate initial master key from environment or generate new
  const masterPassword =
    process.env.ENCRYPTION_MASTER_KEY ||
    crypto.randomBytes(32).toString("hex");
  const salt = crypto.randomBytes(16).toString("hex");
  const keyMaterial = crypto.scryptSync(masterPassword, salt, KEY_LENGTH);

  await db.insert(encryptionKeys).values({
    keyVersion: 1,
    keyMaterial: keyMaterial.toString("hex"),
    salt,
    keyHash: crypto.createHash("sha256").update(keyMaterial).digest("hex"),
    isPrimary: true,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ENCRYPTION_KEY_SCHEDULE_DAYS * 24 * 60 * 60 * 1000),
  });

  // Store master password and salt in environment for persistence
  if (!process.env.ENCRYPTION_MASTER_KEY) {
    console.warn(
      "[fraud] ENCRYPTION_MASTER_KEY not set; generated key will be lost on restart. Set ENCRYPTION_MASTER_KEY in .env.local"
    );
  }
}

// ---------------------------------------------------------------------------
// Encrypt / decrypt helpers
// ---------------------------------------------------------------------------

export async function encryptData(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  await refreshKeyVersionCache();
  const keyVersion = getCurrentKeyVersion();
  const key = await getEncryptionKey(keyVersion);
  if (!key) throw new Error(`No encryption key found for version ${keyVersion}`);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([ciphertext, authTag]).toString("base64"),
    iv: iv.toString("base64"),
  };
}

export async function decryptData(ciphertextB64: string, ivB64: string): Promise<string> {
  await refreshKeyVersionCache();
  const keyVersion = getCurrentKeyVersion();
  const key = await getEncryptionKey(keyVersion);
  if (!key) throw new Error(`No encryption key found for version ${keyVersion}`);

  const iv = Buffer.from(ivB64, "base64");
  const ciphertextWithTag = Buffer.from(ciphertextB64, "base64");
  const ciphertext = ciphertextWithTag.subarray(0, ciphertextWithTag.length - AUTH_TAG_LENGTH);
  const authTag = ciphertextWithTag.subarray(ciphertextWithTag.length - AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}

// ---------------------------------------------------------------------------
// Transaction data encryption (E2E for BINs, IPs, User-Agents)
// ---------------------------------------------------------------------------

export async function encryptTransactionData(
  orderId: number,
  ip: string,
  userAgent: string | null,
  bin?: string | null,
  metadata?: Record<string, unknown>
): Promise<{ ipEncrypted: string; userAgentEncrypted: string; keyVersion: number; binEncrypted?: string }> {
  await refreshKeyVersionCache();
  const keyVersion = getCurrentKeyVersion();

  // Encrypt IP (PII)
  const ipEncResult = await encryptData(ip);
  const ipEncrypted = Buffer.from(JSON.stringify({ ciphertext: ipEncResult.ciphertext, iv: ipEncResult.iv })).toString("base64");

  // Encrypt User-Agent (behavioral fingerprint)
  let userAgentEncrypted = "";
  if (userAgent) {
    const uaEncResult = await encryptData(userAgent);
    userAgentEncrypted = Buffer.from(JSON.stringify({ ciphertext: uaEncResult.ciphertext, iv: uaEncResult.iv })).toString("base64");
  }

  // Encrypt BIN if provided (financial identifier)
  let binEncrypted = "";
  if (bin) {
    const binEncResult = await encryptData(bin);
    binEncrypted = Buffer.from(JSON.stringify({ ciphertext: binEncResult.ciphertext, iv: binEncResult.iv })).toString("base64");
  }

  // Encrypt metadata
  let metadataEncrypted = "";
  if (metadata && Object.keys(metadata).length > 0) {
    const metaEncResult = await encryptData(JSON.stringify(metadata));
    metadataEncrypted = Buffer.from(JSON.stringify({ ciphertext: metaEncResult.ciphertext, iv: metaEncResult.iv })).toString("base64");
  }

  await db
    .update(orders)
    .set({
      ipEncrypted: ipEncrypted || null,
      userAgentEncrypted: userAgentEncrypted || null,
      binEncrypted: binEncrypted || null,
      metadataEncrypted: metadataEncrypted || null,
      encryptionKeyVersion: keyVersion,
    })
    .where(eq(orders.id, orderId));

  return { ipEncrypted, userAgentEncrypted, keyVersion, binEncrypted };
}

// ---------------------------------------------------------------------------
// Key rotation (weekly)
// ---------------------------------------------------------------------------

export async function generateNewKeyVersion(): Promise<number> {
  const masterPassword = process.env.ENCRYPTION_MASTER_KEY;
  if (!masterPassword) throw new Error("ENCRYPTION_MASTER_KEY not configured for key rotation");

  const existingKeys = await db.select().from(encryptionKeys);
  const maxVersion = existingKeys.reduce((max, k) => Math.max(max, k.keyVersion), 0);
  const newVersion = maxVersion + 1;

  const salt = crypto.randomBytes(16).toString("hex");
  const keyMaterial = crypto.scryptSync(masterPassword, salt, KEY_LENGTH);

  await db.insert(encryptionKeys).values({
    keyVersion: newVersion,
    keyMaterial: keyMaterial.toString("hex"),
    salt,
    keyHash: crypto.createHash("sha256").update(keyMaterial).digest("hex"),
    isPrimary: true,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + ENCRYPTION_KEY_SCHEDULE_DAYS * 24 * 60 * 60 * 1000),
  });

  // Demote old primary keys
  await db
    .update(encryptionKeys)
    .set({ isPrimary: false })
    .where(
      sql`${encryptionKeys.isPrimary} = true AND ${encryptionKeys.keyVersion} < ${newVersion}`
    );

  return newVersion;
}

export async function rotateEncryptionKeys(): Promise<{ oldKeyVersion: number; newKeyVersion: number; rotatedCount: number }> {
  const currentVersion = getCurrentKeyVersion();
  const newVersion = await generateNewKeyVersion();

  // Re-encrypt orders that haven't been re-encrypted to the new key
  const ordersToRotate = await db
    .select()
    .from(orders)
    .where(
      and(
        sql`${orders.encryptionKeyVersion} < ${newVersion}`,
        sql`${orders.ipEncrypted} is not null`
      )
    )
    .limit(500);

  let rotatedCount = 0;
  for (const order of ordersToRotate) {
    try {
      // Decrypt with old key
      const oldKey = await getEncryptionKey(currentVersion);
      if (!oldKey) continue;
      if (!order.ipEncrypted) continue;

      const ipJson = JSON.parse(Buffer.from(order.ipEncrypted, "base64").toString("utf8"));
      const oldIv = Buffer.from(ipJson.iv, "base64");
      const oldCiphertextWithTag = Buffer.from(ipJson.ciphertext, "base64");
      const oldCiphertext = oldCiphertextWithTag.subarray(0, oldCiphertextWithTag.length - AUTH_TAG_LENGTH);
      const oldAuthTag = oldCiphertextWithTag.subarray(oldCiphertextWithTag.length - AUTH_TAG_LENGTH);

      const oldDecipher = crypto.createDecipheriv(ALGORITHM, oldKey, oldIv);
      oldDecipher.setAuthTag(oldAuthTag);
      const ip = Buffer.concat([oldDecipher.update(oldCiphertext), oldDecipher.final()]).toString("utf8");

      // Re-encrypt with new key
      const newEncResult = await encryptData(ip);
      const newIpEncrypted = Buffer.from(JSON.stringify({ ciphertext: newEncResult.ciphertext, iv: newEncResult.iv })).toString("base64");

      await db
        .update(orders)
        .set({
          ipEncrypted: newIpEncrypted,
          encryptionKeyVersion: newVersion,
        })
        .where(eq(orders.id, order.id));

      rotatedCount++;
    } catch (err) {
      console.error(`[fraud] Failed to re-encrypt order ${order.id}:`, err);
    }
  }

  // Log key rotation event
  await db.insert(fraudEvents).values({
    eventType: "key_rotation",
    severity: "info",
    description: `Encryption keys rotated from v${currentVersion} to v${newVersion}. Re-encrypted ${rotatedCount} orders.`,
    orderId: null,
  });

  return { oldKeyVersion: currentVersion, newKeyVersion: newVersion, rotatedCount };
}

// ---------------------------------------------------------------------------
// BIN routing & monitoring
// ---------------------------------------------------------------------------

export async function getBINStats(bin: string): Promise<{ total: number; declined: number; chargedback: number; highValueAttempts: number } | null> {
  // Get BIN from recent payments (bin is encrypted, decrypt to analyze)
  const recentPayments = await db
    .select({
      id: payments.id,
      status: payments.status,
      amount: payments.amount,
      providerPaymentRef: payments.providerPaymentRef,
    })
    .from(payments)
    .where(
      and(
        sql`${payments.providerPaymentRef} is not null`,
        sql`${payments.createdAt} > now() - interval '30 days'`
      )
    )
    .limit(1000);

  let total = 0;
  let declined = 0;
  let chargedback = 0;
  let highValueAttempts = 0;

  for (const payment of recentPayments) {
    // Determine BIN from provider reference (Stripe payment intent or charge)
    // In production, this would call Stripe API to get card details
    // For now, we check if BIN is stored
    total++;
    if (payment.status === "failed" || payment.status === "declined") {
      declined++;
    }
    if (payment.amount > BIN_ROUTING_STRATEGIES.highValueThreshold) {
      ++highValueAttempts;
    }
  }

  return { total, declined, chargedback, highValueAttempts };
}

export async function isHighRiskBIN(bin: string): Promise<boolean> {
  const stats = await getBINStats(bin);
  if (!stats) return false;

  // High risk if decline rate > 20% in last 30 days
  if (stats.total > 0 && stats.declined / stats.total > 0.2) {
    return true;
  }

  // Check BIN routing strategy
  const routing = BIN_ROUTING_STRATEGIES.binRules.get(bin);
  if (routing?.action === "block" || routing?.action === "manual_review") {
    return true;
  }

  return false;
}

export async function updateBINRoutingStrategy(
  bin: string,
  action: "allow" | "manual_review" | "block" | "high_value_only",
  reason: string,
  fraudEventId?: number
): Promise<void> {
  const existing = BIN_ROUTING_STRATEGIES.binRules.get(bin);

  if (!existing || existing.action !== action) {
    BIN_ROUTING_STRATEGIES.binRules.set(bin, {
      bin,
      action,
      reason,
      lastUpdated: new Date(),
      fraudEventId,
    });

    // Log the routing change
    await db.insert(fraudEvents).values({
      eventType: "bin_routing_change",
      severity: action === "block" ? "high" : action === "manual_review" ? "medium" : "low",
      description: `BIN ${bin} routing changed to ${action}: ${reason}`,
      orderId: null,
    });
  }
}

export async function monitorHighRiskBINS(): Promise<{ added: string[]; removed: string[] }> {
  const added: string[] = [];
  const removed: string[] = [];

  // Analyze recent transactions for BIN patterns
  const recentPayments = await db
    .select()
    .from(payments)
    .where(
      sql`${payments.createdAt} > now() - interval '7 days'`
    )
    .limit(5000);

  const binStats = new Map<string, { total: number; declined: number; highValue: number }>();

  for (const payment of recentPayments) {
    // Extract BIN from provider reference (in production, decrypt or fetch from Stripe)
    // For demo, we assume BIN is extractable
    const bin = payment.providerPaymentRef ? payment.providerPaymentRef.slice(0, 6) : null;
    if (!bin) continue;

    const stats = binStats.get(bin) || { total: 0, declined: 0, highValue: 0 };
    ++stats.total;
    if (payment.status === "failed" || payment.status === "declined") {
      ++stats.declined;
    }
    if (payment.amount > BIN_ROUTING_STRATEGIES.highValueThreshold) {
      ++stats.highValue;
    }
    binStats.set(bin, stats);
  }

  // Update routing strategies based on stats
  const binStatsArray = Array.from(binStats.entries());
  for (const [binKey, stats] of binStatsArray) {
    if (stats.total < 5) continue;

    const declineRate = stats.declined / stats.total;

    if (declineRate > 0.25) {
      const existing = BIN_ROUTING_STRATEGIES.binRules.get(binKey);
      if (!existing || existing.action === "allow") {
        await updateBINRoutingStrategy(binKey, "manual_review", `Decline rate ${declineRate.toFixed(1)} over 7 days`, undefined);
        added.push(binKey);
      }
    } else if (declineRate < 0.05 && stats.total > 20) {
      const existing = BIN_ROUTING_STRATEGIES.binRules.get(binKey);
      if (existing && existing.action !== "allow") {
        await updateBINRoutingStrategy(binKey, "allow", `Low decline rate ${declineRate.toFixed(1)}`, undefined);
        removed.push(binKey);
      }
    }
  }

  return { added, removed };
}

// ---------------------------------------------------------------------------
// IP geolocation & proxy validation
// ---------------------------------------------------------------------------

export interface GeoMatchResult {
  valid: boolean;
  riskLevel: "low" | "medium" | "high";
  mismatchDetails: string[];
  geoData?: {
    ipCountry?: string;
    ipRegion?: string;
    cardholderCountry?: string;
    cardholderState?: string;
  };
}

export async function validateGeoMatch(
  ip: string,
  cardholderCountry: string,
  cardholderState?: string
): Promise<GeoMatchResult> {
  const mismatches: string[] = [];
  let riskLevel: "low" | "medium" | "high" = "low";

  // Get IP geolocation (in production, use IP geolocation service like MaxMind or ip-api)
  // For demo, we simulate with header data or mock
  const ipCountry = getCountryFromIP(ip);
  const ipRegion = getRegionFromIP(ip);

  // Country mismatch check
  if (ipCountry && ipCountry !== cardholderCountry) {
    mismatches.push(`IP country (${ipCountry}) does not match cardholder country (${cardholderCountry})`);
    riskLevel = "high";      } else if (ipCountry && typeof cardholderCountry === "string" && HIGH_RISK_COUNTRIES.includes(cardholderCountry)) {
    // Additional risk for high-risk countries
    riskLevel = "medium";
    mismatches.push(`Transaction from high-risk country: ${ipCountry}`);
  }

  // State/region mismatch check (if both available)
  if (cardholderState && ipRegion) {
    if (ipRegion.toUpperCase() !== cardholderState.toUpperCase()) {
      mismatches.push(`IP region (${ipRegion}) does not match cardholder state (${cardholderState})`);
      if (riskLevel === "low") riskLevel = "medium";
    }
  }

  // Check if IP is from known residential proxy ranges (in production, check against proxy database)
  const isProxy = isResidentialProxy(ip);

  return {
    valid: mismatches.length === 0,
    riskLevel,
    mismatchDetails: mismatches,
    geoData: {
      ipCountry,
      ipRegion,
      cardholderCountry,
      cardholderState,
    },
  };
}

function getCountryFromIP(ip: string): string | undefined {
  // In production, use geolocation service
  // For demo, return undefined to skip country check
  return undefined;
}

function getRegionFromIP(ip: string): string | undefined {
  // In production, use geolocation service
  return undefined;
}

function isResidentialProxy(ip: string): boolean {
  // In production, check against Bright Data or similar proxy detection service
  // For demo, return false
  return false;
}

export function calculateGeoRisk(
  geoResult: GeoMatchResult,
  amount: number,
  isHighRiskCountry: boolean
): number {
  let risk = 0;

  if (!geoResult.valid) {
    risk += 30;
  }

  if (geoResult.riskLevel === "high") {
    risk += 40;
  } else if (geoResult.riskLevel === "medium") {
    risk += 20;
  }

  if (isHighRiskCountry) {
    risk += 25;
  }

  // Higher amounts with geo mismatch = higher risk
  if (!geoResult.valid && amount > BIN_ROUTING_STRATEGIES.highValueThreshold) {
    risk += 20;
  }

  return Math.min(risk, 100);
}

// ---------------------------------------------------------------------------
// Fraud scoring
// ---------------------------------------------------------------------------

export interface FraudScoreInput {
  ip: string;
  userAgent: string | null;
  bin?: string | null;
  amount: number;
  customerEmail?: string;
  customerName?: string;
  orderHistory?: { totalOrders: number; totalSpent: number };
}

export interface FraudScoreResult {
  score: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  factors: string[];
  recommendations: string[];
  stepUpRequired: boolean;
}

export async function calculateTransactionScore(input: FraudScoreInput): Promise<FraudScoreResult> {
  const factors: string[] = [];
  let score = 0;

  // IP-based factors
  const ipVelocity = await getIPVelocity(input.ip);
  if (ipVelocity.count > 5) {
    factors.push(`High IP velocity: ${ipVelocity.count} transactions in 24h`);
    score += 20;
  }

  const geoResult = await validateGeoMatch(
    input.ip,
    input.customerEmail ? "IN" : "US", // Default to India based on business
    undefined
  );
  const geoRisk = calculateGeoRisk(geoResult, input.amount, false);
  if (geoRisk > 30) {
    factors.push(...geoResult.mismatchDetails);
    score += geoRisk;
  }

  // BIN-based factors
  if (input.bin) {
    const isHighRisk = await isHighRiskBIN(input.bin);
    if (isHighRisk) {
      factors.push(`High-risk BIN: ${input.bin}`);
      score += 25;
    }

    const stats = await getBINStats(input.bin);
    if (stats && stats.declined > 3) {
      factors.push(`BIN has ${stats.declined} recent declines`);
      score += Math.min(stats.declined * 5, 20);
    }
  }

  // Amount-based factors
  if (input.amount > BIN_ROUTING_STRATEGIES.highValueThreshold) {
    factors.push(`High-value transaction: ₹${input.amount}`);
    score += 10;
  }

  if (input.amount > BIN_ROUTING_STRATEGIES.criticalThreshold) {
    factors.push(`Critical-value transaction: ₹${input.amount}`);
    score += 15;
  }

  // User-Agent analysis
  if (input.userAgent) {
    const uaRisk = analyzeUserAgent(input.userAgent);
    if (uaRisk > 0) {
      factors.push(`Suspicious user-agent: ${uaRisk > 50 ? "high risk" : "suspicious"}`);
      score += uaRisk;
    }
  }

  // Customer history
  if (input.orderHistory) {
    if (input.orderHistory.totalOrders === 0) {
      factors.push("First-time customer");
      score += 10;
    }
    if (input.orderHistory.totalSpent > 0 && input.amount > input.orderHistory.totalSpent * 3) {
      factors.push("Unusual spend pattern for customer");
      score += 15;
    }
  }

  // Determine risk level and recommendations
  let riskLevel: "low" | "medium" | "high" | "critical" = "low";
  const recommendations: string[] = [];
  let stepUpRequired = false;

  if (score >= 80) {
    riskLevel = "critical";
    stepUpRequired = true;
    recommendations.push("Require manual review before processing");
    recommendations.push("Consider additional identity verification");
  } else if (score >= 60) {
    riskLevel = "high";
    stepUpRequired = true;
    recommendations.push("Require step-up authentication (3DS)");
    recommendations.push("Review transaction manually if possible");
  } else if (score >= 40) {
    riskLevel = "medium";
    recommendations.push("Monitor transaction closely");
    recommendations.push("Consider additional verification");
  } else {
    riskLevel = "low";
    recommendations.push("Proceed with standard processing");
  }

  return {
    score: Math.min(score, 100),
    riskLevel,
    factors,
    recommendations,
    stepUpRequired,
  };
}

async function getIPVelocity(ip: string): Promise<{ count: number; window: string }> {
  const results = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(payments)
    .where(
      and(
        eq(payments.clientIp, ip),
        sql`${payments.createdAt} > now() - interval '24 hours'`
      )
    )
    .limit(1);

  const first = results[0];
  return { count: first ? Number(first.count) : 0, window: "24h" };
}

function analyzeUserAgent(ua: string): number {
  let risk = 0;

  // Check for suspicious patterns
  if (ua.includes("bot") || ua.includes("crawler") || ua.includes("spider")) {
    risk += 50;
  }

  if (ua.includes("script") || ua.includes("python") || ua.includes("curl")) {
    risk += 40;
  }

  if (!ua.includes("Mozilla") || !ua.includes("Chrome") && !ua.includes("Safari")) {
    risk += 20;
  }

  // Check for automation frameworks
  if (ua.includes("Playwright") || ua.includes("Puppeteer") || ua.includes("Selenium")) {
    risk += 30;
  }

  return risk;
}

// ---------------------------------------------------------------------------
// Webhook notifications
// ---------------------------------------------------------------------------

export async function sendWebhookNotification(
  eventType: string,
  payload: Record<string, unknown>,
  severity: "low" | "medium" | "high" | "critical"
): Promise<void> {
  const destinations = WEBHOOK_DESTINATIONS.filter(
    (d) => d.severity <= severity || d.severity === "all"
  );

  for (const dest of destinations) {
    try {
      // In production, use proper HTTP client
      console.log(`[fraud webhook] Sending ${eventType} to ${dest.url}`);
      // fetch(dest.url, {
      //   method: "POST",
      //   headers: { "Content-Type": "application/json" },
      //   body: JSON.stringify({ eventType, payload, timestamp: new Date().toISOString() }),
      // });
    } catch (err) {
      console.error(`[fraud webhook] Failed to send to ${dest.url}:`, err);
    }
  }

  // Log webhook event
  await db.insert(fraudEvents).values({
    eventType,
    severity,
    description: JSON.stringify(payload),
    orderId: null,
  });
}

// ---------------------------------------------------------------------------
// IP rotation policy
// ---------------------------------------------------------------------------

export interface IPRotationConfig {
  maxConcurrentSessions: number;
  rotationPerTransaction: boolean;
  ruralIPRatio: number; // percentage of rural vs urban IPs
  geoStrictness: "strict" | "moderate" | "loose";
  lockedIPs: string[]; // IPs to block
}

const defaultIPRotationConfig: IPRotationConfig = {
  maxConcurrentSessions: 5,
  rotationPerTransaction: true,
  ruralIPRatio: 0.4,
  geoStrictness: "strict",
  lockedIPs: [],
};

let currentIPRotationConfig = { ...defaultIPRotationConfig };

export function getIPRotationConfig(): IPRotationConfig {
  return currentIPRotationConfig;
}

export async function updateIPRotationPolicy(changes: Partial<IPRotationConfig>): Promise<void> {
  currentIPRotationConfig = { ...currentIPRotationConfig, ...changes };

  // Log policy change
  await db.insert(fraudEvents).values({
    eventType: "ip_rotation_policy_update",
    severity: "low",
    description: `IP rotation policy updated: ${JSON.stringify(changes)}`,
    orderId: null,
  });

  // If fraud spike detected, lock IPs
  if (changes.lockedIPs && changes.lockedIPs.length > 0) {
    for (const ip of changes.lockedIPs) {
      await db.insert(fraudEvents).values({
        eventType: "ip_locked",
        severity: "high",
        description: `IP ${ip} locked due to fraud suspicion`,
        orderId: null,
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Transaction pattern adjustment
// ---------------------------------------------------------------------------

export async function adjustTransactionPatterns(
  feedback: {
    declineRate?: number;
    chargebackRate?: number;
    fraudDetections?: number;
    avgTransactionValue?: number;
  },
  bin?: string
): Promise<void> {
  const eventDescriptions: string[] = [];

  // Adjust based on decline rate
  if (feedback.declineRate !== undefined && feedback.declineRate > 0.1) {
    // High decline rate - tighten patterns
    currentIPRotationConfig.rotationPerTransaction = true;
    currentIPRotationConfig.geoStrictness = "strict";
    eventDescriptions.push(`Tightened patterns due to ${feedback.declineRate.toFixed(1)} decline rate`);
  }

  // Adjust based on chargeback rate
  if (feedback.chargebackRate !== undefined && feedback.chargebackRate > 0.03) {
    // High chargeback rate - increase scrutiny
    if (bin) {
      await updateBINRoutingStrategy(bin, "manual_review", "High chargeback rate", undefined);
    }
    eventDescriptions.push(`Enhanced scrutiny due to ${feedback.chargebackRate.toFixed(1)} chargeback rate`);
  }

  // Adjust based on fraud detections
  if (feedback.fraudDetections !== undefined && feedback.fraudDetections > 0) {
    // Lock IPs associated with fraud
    const fraudIPs = await getFraudAssociatedIPs(feedback.fraudDetections);
    if (fraudIPs.length > 0) {
      await updateIPRotationPolicy({ lockedIPs: fraudIPs });
      eventDescriptions.push(`Locked ${fraudIPs.length} IPs associated with fraud`);
    }
  }

  // Log adjustments
  if (eventDescriptions.length > 0) {
    await db.insert(fraudEvents).values({
      eventType: "transaction_pattern_adjustment",
      severity: "medium",
      description: eventDescriptions.join("; "),
      orderId: null,
    });
  }
}

async function getFraudAssociatedIPs(count: number): Promise<string[]> {
  const [{ ips }] = await db
    .select({ ips: sql<string>`array_agg(distinct ${payments.clientIp})` })
    .from(payments)
    .where(
      and(
        eq(payments.isFraudulent, true),
        sql`${payments.createdAt} > now() - interval '7 days'`
      )
    );

  return ips && Array.isArray(ips) ? ips.filter((ip: string) => ip !== "unknown").slice(0, count) : [];
}

export async function getIPVelocityExtended(ip: string): Promise<{ count: number; firstSeen: Date | null; lastSeen: Date | null }> {
  const results = await db
    .select({
      count: count(),
      firstSeen: sql<Date>`min(${payments.createdAt})`,
      lastSeen: sql<Date>`max(${payments.createdAt})`,
    })
    .from(payments)
    .where(
      and(
        eq(payments.clientIp, ip),
        sql`${payments.createdAt} > now() - interval '24 hours'`
      )
    )
    .limit(1);

  const result = results[0];
  return {
    count: result ? Number(result.count) : 0,
    firstSeen: result?.firstSeen ?? null,
    lastSeen: result?.lastSeen ?? null,
  };
}

export async function getRecentTransactionPatterns(): Promise<{
  totalTransactions: number;
  avgAmount: number;
  binDistribution: Record<string, number>;
  geoDistribution: Record<string, number>;
  ipRotations: number;
}> {
  const totalResult = await db
    .select({ total: count() })
    .from(payments)
    .where(sql`${payments.createdAt} > now() - interval '7 days'`)
    .limit(1);

  const firstResult = totalResult[0];
  const totalTransactions = firstResult ? Number(firstResult.total) : 0;

  const [{ avg }] = await db
    .select({ avg: sql<number>`avg(${payments.amount})::int` })
    .from(payments)
    .where(
      and(
        sql`${payments.createdAt} > now() - interval '7 days'`,
        sql`${payments.amount} > 0`
      )
    );

  const avgAmount = avg ?? 0;

  // Get BIN distribution (would need to decrypt or fetch from Stripe in production)
  const binDist: Record<string, number> = {};

  // Get geo distribution
  const geoDist: Record<string, number> = {};

  // Count IP rotations (unique IPs in last 7 days)
  const [{ ipCount }] = await db
    .select({ ipCount: sql<number>`count(distinct ${payments.clientIp})::int` })
    .from(payments)
    .where(
      and(
        sql`${payments.clientIp} is not null`,
        sql`${payments.clientIp} != 'unknown'`,
        sql`${payments.createdAt} > now() - interval '7 days'`
      )
    );

  return {
    totalTransactions,
    avgAmount,
    binDistribution: binDist,
    geoDistribution: geoDist,
    ipRotations: Number(ipCount ?? 0),
  };
}

// Export for use in routes
export default defaultIPRotationConfig;

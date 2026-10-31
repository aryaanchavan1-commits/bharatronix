import { NextRequest, NextResponse } from "next/server";
import {
  eq,
  and,
  sql,
  desc,
  count,
} from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  payments,
  fraudEvents,
  encryptionKeys,
  siteFlags,
} from "@/db/schema";
import {
  rotateEncryptionKeys,
  monitorHighRiskBINS,
  updateIPRotationPolicy,
  adjustTransactionPatterns,
  getCurrentKeyVersion,
  sendWebhookNotification,
} from "@/lib/fraud";
import {
  ENCRYPTION_KEY_SCHEDULE_DAYS,
} from "@/lib/fraud-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  const results: Record<string, unknown> = {};

  try {
    results.keyRotation = await handleKeyRotationCheck();
    results.binMonitoring = await handleBINMonitoring();
    results.ipRotation = await handleIPRotationCheck();
    results.cvvMonitoring = await handleCVVMonitoring();
    results.patternAdjustment = await handlePatternAdjustment();

    await db.insert(fraudEvents).values({
      eventType: "cron_execution",
      severity: "low",
      description: `Fraud cron executed in ${Date.now() - startTime}ms.`,
      source: "cron",
    });

    return NextResponse.json({
      success: true,
      results,
      executionTime: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[cron/fraud] Error:", err);
    return NextResponse.json(
      { error: "Fraud cron failed" },
      { status: 500 }
    );
  }
}

async function handleKeyRotationCheck() {
  const [primaryKey] = await db
    .select()
    .from(encryptionKeys)
    .where(eq(encryptionKeys.isPrimary, true))
    .limit(1);

  if (!primaryKey) {
    return { error: "No primary encryption key found", rotated: false };
  }

  const now = new Date();
  const expiresAt = primaryKey.expiresAt;
  const isExpired = expiresAt ? new Date(expiresAt) < now : false;

  const needsRotation =
    isExpired ||
    (expiresAt && new Date(expiresAt).getTime() - now.getTime() < 24 * 60 * 60 * 1000);

  if (needsRotation) {
    console.log("[cron/fraud] Rotating encryption keys...");
    const result = await rotateEncryptionKeys();
    console.log(
      `[cron/fraud] Key rotation complete: v${result.oldKeyVersion} -> v${result.newKeyVersion}, ${result.rotatedCount} orders re-encrypted`
    );

    await sendWebhookNotification(
      "key_rotation",
      {
        oldKeyVersion: result.oldKeyVersion,
        newKeyVersion: result.newKeyVersion,
        rotatedCount: result.rotatedCount,
        rotatedBy: "cron",
      },
      "low"
    );

    return {
      rotated: true,
      oldKeyVersion: result.oldKeyVersion,
      newKeyVersion: result.newKeyVersion,
      rotatedCount: result.rotatedCount,
      reason: isExpired ? "Key expired" : "Key near expiration",
    };
  }

  return {
    rotated: false,
    currentKeyVersion: primaryKey.keyVersion,
    expiresAt: expiresAt?.toISOString() ?? null,
    reason: "Key not yet due for rotation",
  };
}

async function handleBINMonitoring() {
  console.log("[cron/fraud] Monitoring high-risk BINs...");
  const result = await monitorHighRiskBINS();

  if (result.added.length > 0) {
    console.log(`[cron/fraud] Added ${result.added.length} high-risk BINs to monitoring`);
  }

  if (result.removed.length > 0) {
    console.log(`[cron/fraud] Removed ${result.removed.length} BINs from high-risk monitoring`);
  }

  if (result.added.length > 0 || result.removed.length > 0) {
    await sendWebhookNotification(
      "bin_monitoring_update",
      {
        added: result.added,
        removed: result.removed,
        monitoredBy: "cron",
      },
      result.added.length > 0 ? "medium" : "low"
    );
  }

  return {
    added: result.added,
    removed: result.removed,
    totalBinsMonitored: 100,
  };
}

interface SuspiciousIP {
  ip: string;
  fraudScore: number;
  transactionCount: number;
}

async function handleIPRotationCheck() {
  const suspiciousIPs = await getSuspiciousIPs();

  let lockedCount = 0;

  if (suspiciousIPs.length > 0) {
    console.log(`[cron/fraud] Found ${suspiciousIPs.length} suspicious IPs`);

    const highFraudIPs = suspiciousIPs.filter((ip) => ip.fraudScore >= 80);
    if (highFraudIPs.length > 0) {
      await updateIPRotationPolicy({
        lockedIPs: highFraudIPs.map((ip) => ip.ip),
      });

      for (const ipInfo of highFraudIPs) {
        await db.insert(fraudEvents).values({
          eventType: "ip_locked",
          severity: "high",
          description: `IP ${ipInfo.ip} locked by cron due to high fraud score (${ipInfo.fraudScore})`,
          ip: ipInfo.ip,
          source: "cron_ip_rotation",
        });

        await sendWebhookNotification(
          "ip_locked",
          {
            ip: ipInfo.ip,
            fraudScore: ipInfo.fraudScore,
            reason: "High fraud score detected by cron",
            lockedBy: "cron",
          },
          "high"
        );
      }

      lockedCount = highFraudIPs.length;
      console.log(`[cron/fraud] Locked ${lockedCount} IPs`);
    }

    if (suspiciousIPs.length > 5) {
      await updateIPRotationPolicy({
        maxConcurrentSessions: 3,
        geoStrictness: "strict",
      });

      await adjustTransactionPatterns({
        fraudDetections: suspiciousIPs.length,
      });

      console.log("[cron/fraud] Tightened IP rotation policy due to suspicious activity");
    }
  }

  return {
    suspiciousIPs: suspiciousIPs.length,
    lockedIPs: lockedCount,
    policyAdjusted: suspiciousIPs.length > 5,
  };
}

async function getSuspiciousIPs(): Promise<SuspiciousIP[]> {
  const results = await db
    .select({
      ip: payments.clientIp,
      count: count(),
      fraudCount: sql<number>
        `count(*) filter (where ${payments.isFraudulent} = true)::int`,
    })
    .from(payments)
    .where(
      and(
        sql`${payments.clientIp} is not null`,
        sql`${payments.clientIp} != 'unknown'`,
        sql`${payments.createdAt} > now() - interval '7 days'`
      )
    )
    .groupBy(payments.clientIp)
    .having(
      sql`count(*) filter (where ${payments.isFraudulent} = true)::int > 0`
    )
    .limit(100);

  return results
    .filter((r) => r.ip && r.ip !== "unknown")
    .map((r) => ({
      ip: r.ip!,
      fraudScore: calculateIPFraudScore(r.fraudCount, Number(r.count)),
      transactionCount: Number(r.count),
    }))
    .filter((ip) => ip.fraudScore >= 60)
    .sort((a, b) => b.fraudScore - a.fraudScore)
    .slice(0, 20);
}

function calculateIPFraudScore(fraudCount: number, totalCount: number): number {
  if (totalCount === 0) return 0;
  const fraudRate = fraudCount / totalCount;
  return Math.min(Math.round(fraudRate * 100 + (totalCount > 10 ? 20 : 0)), 100);
}

async function handleCVVMonitoring() {
  console.log("[cron/fraud] Checking CVV/3DS status on payment methods...");

  return {
    checked: 0,
    cvvDisabledFound: 0,
    actionTaken: "No action - CVV monitoring not yet implemented",
  };
}

async function handlePatternAdjustment() {
  const results = await db
    .select({
      total: sql<number>`count(*)::int`,
      declined: sql<number>`count(*) filter (where ${payments.status} = 'failed')::int`,
      chargedback: sql<number>`count(*) filter (where ${payments.isFraudulent} = true)::int`,
    })
    .from(payments)
    .where(sql`${payments.createdAt} >= date_trunc('day', now())`)
    .limit(1);

  const first = results[0];
  if (!first) {
    return {
      total: 0,
      declined: 0,
      chargedback: 0,
      declineRate: 0,
      chargebackRate: 0,
      adjustments: [],
      paused: false,
    };
  }

  const total = first.total;
  const declined = first.declined;
  const chargedback = first.chargedback;

  const totalNum = Number(total);
  const declineRate = totalNum > 0 ? Number(declined) / totalNum : 0;
  const chargebackRate = totalNum > 0 ? Number(chargedback) / totalNum : 0;

  console.log(
    `[cron/fraud] Today's stats: total=${totalNum}, declined=${declined}, chargedback=${chargedback}`
  );
  console.log(
    `[cron/fraud] Rates: decline=${declineRate.toFixed(4)}, chargeback=${chargebackRate.toFixed(4)}`
  );

  const adjustments: string[] = [];

  if (declineRate > 0.1) {
    await adjustTransactionPatterns({ declineRate });
    adjustments.push(`Tightened patterns: decline rate ${declineRate.toFixed(4)} > 0.1`);

    if (declineRate > 0.2) {
      await db
        .insert(siteFlags)
        .values({
          key: "payments_paused",
          value: "true",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: siteFlags.key,
          set: {
            value: "true",
            updatedAt: new Date(),
          },
        });

      adjustments.push("Payments PAUSED due to high decline rate");

      await sendWebhookNotification(
        "payments_paused",
        {
          declineRate,
          reason: "High decline rate detected by cron",
          pausedBy: "cron",
        },
        "critical"
      );
    }
  }

  if (chargebackRate > 0.03) {
    await adjustTransactionPatterns({ chargebackRate });
    adjustments.push(`Enhanced scrutiny: chargeback rate ${chargebackRate.toFixed(4)} > 0.03`);

    await sendWebhookNotification(
      "high_chargeback_rate",
      {
        chargebackRate,
        reason: "High chargeback rate detected by cron",
        alertBy: "cron",
      },
      "high"
    );
  }

  const [pauseFlag] = await db
    .select()
    .from(siteFlags)
    .where(eq(siteFlags.key, "payments_paused"))
    .limit(1);

  return {
    total,
    declined,
    chargedback,
    declineRate: Number(declineRate.toFixed(4)),
    chargebackRate: Number(chargebackRate.toFixed(4)),
    adjustments,
    paused: pauseFlag?.value === "true",
  };
}

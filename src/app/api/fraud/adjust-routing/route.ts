import { NextRequest, NextResponse } from "next/server";
import {
  eq,
  and,
  sql,
  asc,
  desc,
  count,
} from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  payments,
  fraudEvents,
  siteFlags,
} from "@/db/schema";
import {
  updateBINRoutingStrategy,
  updateIPRotationPolicy,
  adjustTransactionPatterns,
  sendWebhookNotification,
  encryptTransactionData,
} from "@/lib/fraud";
import {
  BIN_ROUTING_STRATEGIES,
  HIGH_RISK_COUNTRIES,
} from "@/lib/fraud-config";

export const dynamic = "force-dynamic";

// POST /api/fraud/adjust-routing
// Adjust BIN routing, IP rotation, and transaction patterns in real-time
// based on feedback from monitoring dashboards
export async function POST(req: NextRequest) {
  try {
    // Authentication check (use same CRON_SECRET or dedicated fraud secret)
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET || process.env.FRAUD_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      bin,
      action,
      reason,
      ip,
      lockIP,
      unlockIP,
      ipRotationConfig,
      transactionFeedback,
      webhookOnly,
    } = body;

    const results: Record<string, unknown> = {};
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "api";
    const userAgent = req.headers.get("user-agent") ?? null;

    // 1. Adjust BIN routing
    if (bin && action) {
      const validActions = ["allow", "manual_review", "block", "high_value_only"] as const;
      if (!validActions.includes(action)) {
        return NextResponse.json(
          { error: `Invalid action: ${action}. Must be one of: ${validActions.join(", ")}` },
          { status: 400 }
        );
      }

      await updateBINRoutingStrategy(bin, action, reason || "Manual adjustment", undefined);

      // Log the adjustment
      await db.insert(fraudEvents).values({
        eventType: "bin_routing_adjustment",
        severity: action === "block" ? "high" : action === "manual_review" ? "medium" : "low",
        description: `BIN ${bin} adjusted to ${action}: ${reason || "Manual adjustment"}`,
        ip: clientIp,
        userAgent,
        source: "api_adjust_routing",
      });

      results.binAdjustment = { bin, action, reason };

      // Send webhook notification
      await sendWebhookNotification(
        "bin_routing_adjustment",
        {
          bin,
          action,
          reason,
          adjustedBy: "api",
        },
        action === "block" ? "high" : "medium"
      );
    }

    // 2. Lock/unlock IP
    if (lockIP && typeof lockIP === "string") {
      await updateIPRotationPolicy({
        lockedIPs: [lockIP],
      });

      await db.insert(fraudEvents).values({
        eventType: "ip_locked",
        severity: "high",
        description: `IP ${lockIP} locked via API adjustment`,
        ip: lockIP,
        source: "api_adjust_routing",
      });

      results.ipLocked = lockIP;

      await sendWebhookNotification(
        "ip_locked",
        { ip: lockIP, reason: reason || "Manual lock via API" },
        "high"
      );
    }

    if (unlockIP && typeof unlockIP === "string") {
      // Remove from locked list
      const config = {
        lockedIPs: [],
      };
      await updateIPRotationPolicy(config);

      await db.insert(fraudEvents).values({
        eventType: "ip_unlocked",
        severity: "low",
        description: `IP ${unlockIP} unlocked via API adjustment`,
        ip: unlockIP,
        source: "api_adjust_routing",
      });

      results.ipUnlocked = unlockIP;
    }

    // 3. Update IP rotation configuration
    if (ipRotationConfig) {
      await updateIPRotationPolicy(ipRotationConfig);

      await db.insert(fraudEvents).values({
        eventType: "ip_rotation_policy_update",
        severity: "low",
        description: `IP rotation config updated: ${JSON.stringify(ipRotationConfig)}`,
        ip: clientIp,
        userAgent,
        source: "api_adjust_routing",
      });

      results.ipRotationConfig = ipRotationConfig;

      await sendWebhookNotification(
        "ip_rotation_policy_update",
        { config: ipRotationConfig },
        "low"
      );
    }

    // 4. Adjust transaction patterns based on feedback
    if (transactionFeedback && !webhookOnly) {
      await adjustTransactionPatterns(transactionFeedback, bin ?? undefined);

      await db.insert(fraudEvents).values({
        eventType: "transaction_pattern_adjustment",
        severity: "medium",
        description: `Transaction patterns adjusted based on feedback: ${JSON.stringify(transactionFeedback)}`,
        ip: clientIp,
        userAgent,
        source: "api_adjust_routing",
      });

      results.transactionPatternsAdjusted = transactionFeedback;

      await sendWebhookNotification(
        "transaction_pattern_adjustment",
        { feedback: transactionFeedback },
        "medium"
      );
    }

    // 5. If webhookOnly, just send notification without adjusting
    if (webhookOnly && body.webhookPayload) {
      await sendWebhookNotification(
        body.webhookEvent || "custom_event",
        body.webhookPayload,
        body.webhookSeverity || "low"
      );

      results.webhookSent = true;
    }

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fraud/adjust-routing] Error:", err);
    return NextResponse.json(
      { error: "Failed to adjust routing" },
      { status: 500 }
    );
  }
}

// GET /api/fraud/adjust-routing
// Get current routing configuration and status
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET || process.env.FRAUD_SECRET;
    if (secret && auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get current BIN routing strategies
    const binRules = Array.from(BIN_ROUTING_STRATEGIES.binRules.entries()).map(
      ([bin, rule]) => ({
        bin,
        action: rule.action,
        reason: rule.reason,
        lastUpdated: rule.lastUpdated.toISOString(),
      })
    );

    // Get recent fraud events (last 100)
    const recentEvents = await db
      .select()
      .from(fraudEvents)
      .orderBy(desc(fraudEvents.createdAt))
      .limit(100);

    // Get IP rotation config (from manual config)
    const ipRotationConfig = {
      lockedIPs: [],
      maxConcurrentSessions: 5,
      rotationPerTransaction: true,
      ruralIPRatio: 0.4,
      geoStrictness: "strict",
    };

    // Get payment method monitoring status
    // Check if CVV is disabled for any high-risk BINs
    const cvvStatus = await checkCVVAvailability();

    return NextResponse.json({
      binRouting: {
        rules: binRules,
        trustedBins: BIN_ROUTING_STRATEGIES.trustedBins,
        blockedBins: BIN_ROUTING_STRATEGIES.blockedBins,
        highValueThreshold: BIN_ROUTING_STRATEGIES.highValueThreshold,
      },
      ipRotation: ipRotationConfig,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        severity: e.severity,
        description: e.description,
        createdAt: e.createdAt.toISOString(),
      })),
      cvvMonitoring: cvvStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fraud/adjust-routing] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch routing configuration" },
      { status: 500 }
    );
  }
}

async function checkCVVAvailability(): Promise<{
  monitoredBins: Array<{ bin: string; cvvAvailable: boolean; lastChecked: string }>;
  alerts: string[];
}> {
  // In production, this would poll Stripe's API to check CVV availability
  // For now, return mock data
  return {
    monitoredBins: [],
    alerts: [],
  };
}

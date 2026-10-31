import { NextRequest, NextResponse } from "next/server";
import {
  eq,
  sql,
  desc,
  count,
} from "drizzle-orm";
import { db } from "@/db";
import {
  payments,
  fraudEvents,
  encryptionKeys,
} from "@/db/schema";
import {
  getCurrentKeyVersion,
} from "@/lib/fraud";
import {
  BIN_ROUTING_STRATEGIES,
  HIGH_RISK_COUNTRIES,
  FRAUD_SCORE_THRESHOLDS,
  WEBHOOK_DESTINATIONS,
  IP_VELOCITY_LIMIT,
  GEO_MATCH_THRESHOLD,
  ENCRYPTION_KEY_SCHEDULE_DAYS,
  ENCRYPTION_KEY_CIPHER,
} from "@/lib/fraud-config";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const keyVersion = getCurrentKeyVersion();

    const [primaryKey] = await db
      .select()
      .from(encryptionKeys)
      .where(eq(encryptionKeys.isPrimary, true))
      .limit(1);

    const binRules = Array.from(BIN_ROUTING_STRATEGIES.binRules.entries()).map(
      ([bin, rule]) => ({
        bin,
        action: rule.action,
        lastUpdated: rule.lastUpdated.toISOString(),
      })
    );

    const statsResults = await db
      .select({
        totalTransactions: sql<number>`count(*)::int`,
        declinedTransactions: sql<number>
          `count(*) filter (where ${payments.status} = 'failed')::int`,
        chargebackTransactions: sql<number>
          `count(*) filter (where ${payments.isFraudulent} = true)::int`,
      })
      .from(payments)
      .where(
        sql`${payments.createdAt} > now() - interval '7 days'`
      )
      .limit(1);

  const stats = statsResults[0];
  const totalTransactions = stats ? Number(stats.totalTransactions) : 0;
  const declinedTransactions = stats ? Number(stats.declinedTransactions) : 0;
  const chargebackTransactions = stats ? Number(stats.chargebackTransactions) : 0;

    const highRiskBins = await getHighRiskBinStats();

    const recentEventsResults = await db
      .select({
        id: fraudEvents.id,
        eventType: fraudEvents.eventType,
        severity: fraudEvents.severity,
        createdAt: fraudEvents.createdAt,
      })
      .from(fraudEvents)
      .orderBy(desc(fraudEvents.createdAt))
      .limit(20);

    const recentEvents = recentEventsResults.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      severity: e.severity,
      createdAt: e.createdAt.toISOString(),
    }));

    return NextResponse.json({
      encryption: {
        algorithm: ENCRYPTION_KEY_CIPHER,
        keyVersion,
        rotationScheduleDays: ENCRYPTION_KEY_SCHEDULE_DAYS,
        keyExpiresAt:
          primaryKey?.expiresAt?.toISOString() ?? null,
      },
      binRouting: {
        trustedBins: BIN_ROUTING_STRATEGIES.trustedBins,
        blockedBins: BIN_ROUTING_STRATEGIES.blockedBins,
        highValueThreshold: BIN_ROUTING_STRATEGIES.highValueThreshold,
        criticalThreshold: BIN_ROUTING_STRATEGIES.criticalThreshold,
        rules: binRules,
      },
      riskThresholds: {
        fraudScore: FRAUD_SCORE_THRESHOLDS,
        ipVelocityLimit: IP_VELOCITY_LIMIT,
        geoMatchThreshold: GEO_MATCH_THRESHOLD,
        highRiskCountries: HIGH_RISK_COUNTRIES,
      },
      webhook: {
        destinations: WEBHOOK_DESTINATIONS.map((d) => ({
          severity: d.severity,
          events: d.events,
        })),
        recentEventCount: recentEvents.length,
      },
      statistics: {
        totalTransactions,
        declinedTransactions,
        chargebackTransactions,
        declineRate:
          totalTransactions > 0
            ? Number(((declinedTransactions) / (totalTransactions)).toFixed(4))
            : 0,
        chargebackRate:
          totalTransactions > 0
            ? Number(((chargebackTransactions) / (totalTransactions)).toFixed(4))
            : 0,
        highRiskBins,
      },
      recentEvents,
      ipRotation: {
        maxConcurrentSessions: 5,
        rotationPerTransaction: true,
        ruralIPRatio: 0.4,
        geoStrictness: "strict",
        lockedIPs: [],
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fraud/config] Error:", err);
    return NextResponse.json(
      { error: "Failed to fetch fraud configuration" },
      { status: 500 }
    );
  }
}

async function getHighRiskBinStats() {
  const results = await db
    .select({
      bin: sql<string>`substr(${payments.providerPaymentRef}::text, 1, 6)`,
      count: count(),
      declined: sql<number>
        `count(*) filter (where ${payments.status} = 'failed')::int`,
    })
    .from(payments)
    .where(
      sql`${payments.providerPaymentRef} is not null`
    )
    .groupBy(sql`substr(${payments.providerPaymentRef}::text, 1, 6)`)
    .limit(10);

  return results.map((r) => ({
    bin: r.bin,
    total: Number(r.count),
    declined: Number(r.declined),
    declineRate: Number(r.count) > 0
      ? Number(((r.declined / r.count) * 100).toFixed(1))
      : 0,
  }));
}

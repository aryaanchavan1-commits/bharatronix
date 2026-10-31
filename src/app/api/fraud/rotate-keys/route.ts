import { NextRequest, NextResponse } from "next/server";
import {
  eq,
  and,
  sql,
  desc,
} from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  fraudEvents,
  encryptionKeys,
} from "@/db/schema";
import {
  rotateEncryptionKeys,
  getCurrentKeyVersion,
} from "@/lib/fraud";
import {
  ENCRYPTION_KEY_SCHEDULE_DAYS,
  ENCRYPTION_KEY_CIPHER,
} from "@/lib/fraud-config";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET || process.env.FRAUD_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [lastRotation] = await db
      .select({
        createdAt: sql<Date>`max(${fraudEvents.createdAt})`,
      })
      .from(fraudEvents)
      .where(
        and(
          eq(fraudEvents.eventType, "key_rotation"),
          eq(fraudEvents.severity, "low")
        )
      )
      .limit(1);

    const now = new Date();
    const lastRotatedAt = lastRotation?.createdAt ?? new Date(0);
    const hoursSinceRotation = (now.getTime() - lastRotatedAt.getTime()) / (1000 * 60 * 60);

    if (hoursSinceRotation < 48) {
      return NextResponse.json(
        {
          error: "Key rotation performed too recently. Minimum 48 hours between rotations.",
          lastRotation: lastRotatedAt.toISOString(),
          hoursSinceRotation: Math.round(hoursSinceRotation * 10) / 10,
        },
        { status: 429 }
      );
    }

    const result = await rotateEncryptionKeys();

    await db.insert(fraudEvents).values({
      eventType: "key_rotation",
      severity: "low",
      description: `Encryption keys rotated from v${result.oldKeyVersion} to v${result.newKeyVersion}. Re-encrypted ${result.rotatedCount} orders.`,
      source: "api_key_rotation",
    });

    const [newKey] = await db
      .select()
      .from(encryptionKeys)
      .where(eq(encryptionKeys.keyVersion, result.newKeyVersion))
      .limit(1);

    return NextResponse.json({
      success: true,
      oldKeyVersion: result.oldKeyVersion,
      newKeyVersion: result.newKeyVersion,
      rotatedCount: result.rotatedCount,
      newKeyExpiresAt: newKey?.expiresAt?.toISOString() ?? null,
      algorithm: ENCRYPTION_KEY_CIPHER,
      rotationScheduleDays: ENCRYPTION_KEY_SCHEDULE_DAYS,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fraud/rotate-keys] Error:", err);
    return NextResponse.json(
      { error: "Failed to rotate encryption keys" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET || process.env.FRAUD_SECRET;
    if (!secret || auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const currentVersion = getCurrentKeyVersion();

    const keys = await db
      .select({
        keyVersion: encryptionKeys.keyVersion,
        isPrimary: encryptionKeys.isPrimary,
        createdAt: encryptionKeys.createdAt,
        expiresAt: encryptionKeys.expiresAt,
      })
      .from(encryptionKeys)
      .orderBy(desc(encryptionKeys.keyVersion));

    const [lastRotation] = await db
      .select()
      .from(fraudEvents)
      .where(
        and(
          eq(fraudEvents.eventType, "key_rotation"),
          eq(fraudEvents.severity, "low")
        )
      )
      .orderBy(desc(fraudEvents.createdAt))
      .limit(1);

    const ordersWithOldKeys = await db
      .select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        encryptionKeyVersion: orders.encryptionKeyVersion,
      })
      .from(orders)
      .where(
        and(
          sql`${orders.encryptionKeyVersion} < ${currentVersion}`,
          sql`${orders.ipEncrypted} is not null`
        )
      )
      .limit(10);

    const [primaryKey] = await db
      .select()
      .from(encryptionKeys)
      .where(eq(encryptionKeys.isPrimary, true))
      .limit(1);

    const isRotationDue = primaryKey?.expiresAt
      ? new Date(primaryKey.expiresAt) < new Date()
      : false;

    return NextResponse.json({
      currentKeyVersion: currentVersion,
      keys: keys.map((k) => ({
        keyVersion: k.keyVersion,
        isPrimary: k.isPrimary,
        createdAt: k.createdAt.toISOString(),
        expiresAt: k.expiresAt?.toISOString() ?? null,
      })),
      lastRotation: lastRotation
        ? {
            description: lastRotation.description,
            createdAt: lastRotation.createdAt.toISOString(),
          }
        : null,
      ordersNeedingReEncryption: ordersWithOldKeys.length,
      sampleOrdersNeedingReEncryption: ordersWithOldKeys.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        encryptionKeyVersion: o.encryptionKeyVersion,
      })),
      rotationScheduleDays: ENCRYPTION_KEY_SCHEDULE_DAYS,
      isRotationDue,
      algorithm: ENCRYPTION_KEY_CIPHER,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[fraud/rotate-keys] GET error:", err);
    return NextResponse.json(
      { error: "Failed to fetch key status" },
      { status: 500 }
    );
  }
}

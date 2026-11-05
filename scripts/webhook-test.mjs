// Verify DODO_WEBHOOK_SECRET end to end: sign a Standard Webhooks payload the
// same way Dodo does and prove the app accepts it - and still rejects a forgery.
// Run: DODO_WEBHOOK_SECRET=... BASE_URL=http://127.0.0.1:3000 node webhook-test.mjs
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const secret = process.env.DODO_WEBHOOK_SECRET;
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
assert.ok(secret && secret.startsWith("whsec_"), "DODO_WEBHOOK_SECRET missing or malformed");

const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
console.log(`secret ${secret.length} chars -> decoded key ${key.length} bytes`);
assert.ok(key.length > 0, "decoded key is empty: base64 payload is invalid, every delivery would 401");

async function post(body, { forge = false } = {}) {
  const id = `msg_check_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = forge
    ? "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    : `v1,${createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const res = await fetch(`${base}/api/dodo/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      "webhook-signature": sig,
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

// A real order number is deliberately avoided: payment.succeeded for an order
// that does not exist is a no-op in markOrderPaid, so this cannot issue keys.
const noSuchOrder = { metadata: { order_number: "CRN-CHECK-NOT-A-REAL-ORDER" } };

const ignored = JSON.stringify({ type: "webhook.check", data: noSuchOrder });
const forged = await post(ignored, { forge: true });
console.log(`forged signature -> ${forged.status} ${forged.body}`);
assert.equal(forged.status, 401, "forged delivery must be rejected");

const accepted = await post(ignored);
console.log(`valid signature, ignored event -> ${accepted.status}`);
assert.equal(accepted.status, 200, "valid signature must be accepted");

const succeeded = JSON.stringify({
  type: "payment.succeeded",
  data: { payment_id: "pay_CHECK_ONLY", ...noSuchOrder },
});
const paid = await post(succeeded);
console.log(`valid signature, payment.succeeded (no such order) -> ${paid.status}`);
assert.equal(paid.status, 200);

console.log("OK - secret is valid, signatures verify, forgeries rejected");

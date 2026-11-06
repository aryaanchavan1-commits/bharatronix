// Verify KELVIQ_WEBHOOK_SECRET end to end: sign a payload the same way Kelviq
// does and prove the app accepts it - and still rejects a forgery.
// Run: KELVIQ_WEBHOOK_SECRET=... BASE_URL=http://127.0.0.1:3000 node scripts/kelviq-webhook-test.mjs
//
// ORDER_NUMBER (optional) must be an ABANDONED test order: the script then sends
// validly signed underpayments and asserts the order stays pending, so a removed
// settlement guard fails loudly instead of handing out licenses for no money.
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";

const secret = process.env.KELVIQ_WEBHOOK_SECRET;
const base = process.env.BASE_URL || "http://127.0.0.1:3000";
assert.ok(secret, "KELVIQ_WEBHOOK_SECRET missing");

const raw = secret.replace(/^kq_whsec_/, "").replace(/^whsec_/, "");
// The verifier accepts the secret as base64 or raw bytes (which one Kelviq
// means is not documented), so sign with both and require both to be accepted.
const keys = [Buffer.from(raw, "base64"), Buffer.from(raw, "utf8")].filter((k) => k.length);
assert.ok(keys.length, "secret yields no usable key");
console.log(`secret ${secret.length} chars -> ${keys.map((k) => `${k.length}B`).join(" / ")}`);

async function post(body, { forge = false, keyIndex = 0 } = {}) {
  const id = `msg_check_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = forge
    ? "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
    : `v1,${createHmac("sha256", keys[keyIndex]).update(`${id}.${ts}.${body}`).digest("base64")}`;
  const res = await fetch(`${base}/api/kelviq/webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "webhook-id": id,
      "webhook-timestamp": ts,
      // The header Kelviq documents. The route also accepts webhook-signature.
      "kelviq-signature": sig,
    },
    body,
  });
  return { status: res.status, body: await res.text() };
}

// A real order number is deliberately avoided: a completion for an order that
// does not exist is a no-op in markOrderPaid, so this cannot issue keys.
const noSuchOrder = { metadata: { order_number: "CRN-CHECK-NOT-A-REAL-ORDER" } };
const event = (object) =>
  JSON.stringify({
    id: `evt_check_${Date.now()}`,
    type: "checkout.completed",
    created_at: new Date().toISOString(),
    data: { object },
  });

const forged = await post(event({ status: "success", ...noSuchOrder }), { forge: true });
console.log(`forged signature -> ${forged.status} ${forged.body}`);
assert.equal(forged.status, 401, "forged delivery must be rejected");

for (let i = 0; i < keys.length; i++) {
  const ok = await post(event({ status: "success", amount_units: 100, currency: "INR", ...noSuchOrder }), {
    keyIndex: i,
  });
  console.log(`valid signature (key form ${i}) -> ${ok.status}`);
  assert.equal(ok.status, 200, "valid signature must be accepted");
}

// A non-success completion must not settle anything either; it returns 200 and
// simply does nothing.
const notSuccess = await post(
  event({ status: "failed", amount_units: 100, currency: "INR", ...noSuchOrder })
);
assert.equal(notSuccess.status, 200);

if (process.env.ORDER_NUMBER) {
  const orderNumber = process.env.ORDER_NUMBER;
  const readOrder = async () => {
    const res = await fetch(`${base}/api/orders?orderNumber=${encodeURIComponent(orderNumber)}`);
    assert.equal(res.status, 200, `order ${orderNumber} not found on ${base}`);
    return res.json();
  };

  const before = await readOrder();
  assert.equal(before.status, "pending", `test order must be pending, it is "${before.status}"`);
  console.log(`underpayment check on ${orderNumber} (order total ${before.total} rupees)`);

  // amount_units is paise, the order API reports rupees. Both cases must be
  // refused; the half-total one is what catches a unit mix-up, because in mixed
  // units it looks like a large overpayment.
  const halfTotalPaise = Math.round(before.total * 50);
  for (const testCase of [
    { label: "1 paise", amount: 1 },
    { label: `half the total (${halfTotalPaise} paise)`, amount: halfTotalPaise },
  ]) {
    const res = await post(
      event({
        id: `ord_CHECK_UNDERPAID_${testCase.amount}`,
        status: "success",
        amount_units: testCase.amount,
        amount: String(testCase.amount / 100),
        currency: "INR",
        metadata: { order_number: orderNumber },
      })
    );
    assert.equal(res.status, 200, "webhook must acknowledge a signed event");

    const after = await readOrder();
    assert.equal(
      after.status,
      "pending",
      `GUARD FAILED: ${testCase.label} must not mark the order paid or issue keys`
    );
    console.log(`  ${testCase.label} -> refused, order still ${after.status}: OK`);
  }
} else {
  console.log("SKIP underpayment guard check (set ORDER_NUMBER to an abandoned test order)");
}

console.log("OK - secret is valid, signatures verify, forgeries rejected");

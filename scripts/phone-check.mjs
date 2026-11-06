// Guards the checkout phone normaliser: a space or a missing country code used
// to reach Dodo as a 400 and kill the order with "Please retry in a moment".
// Run: node scripts/phone-check.mjs
import assert from "node:assert/strict";
import { normalizePhone } from "../src/lib/phone.ts";

const cases = [
  [undefined, ""],
  [null, ""],
  ["   ", ""],
  // What buyers actually type.
  ["8857912586", "+918857912586"],
  ["88579 12586", "+918857912586"],
  ["+91 88579 12586", "+918857912586"],
  ["+91-88579-12586", "+918857912586"],
  ["918857912586", "+918857912586"],
  ["08857912586", "+918857912586"],
  ["0091 88579 12586", "+918857912586"],
  ["+1 (415) 555-2671", "+14155552671"],
  // Not phone numbers: the caller must say so instead of retrying.
  ["12345", null],
  ["not a phone", null],
  ["0000", null],
  ["+", null],
];

for (const [input, expected] of cases) {
  const actual = normalizePhone(input);
  assert.equal(actual, expected, `${JSON.stringify(input)} -> ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`);
  if (expected) assert.ok(expected.length <= 16, "E.164 is at most 16 chars including +");
}

// Every output that is not empty must be strict E.164: Dodo rejects anything else.
for (const [input, expected] of cases) {
  if (!expected) continue;
  assert.match(expected, /^\+\d{8,15}$/, `E.164 for ${input}`);
}

console.log(`OK - ${cases.length} phone shapes normalise to strict E.164`);

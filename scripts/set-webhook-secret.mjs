// Set DODO_WEBHOOK_SECRET in the app .env from a file, then remove the file.
// Kept out of shell args so a secret containing + or / can't be mangled.
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";

const envPath = process.argv[2];
const secretPath = process.argv[3];

const secret = readFileSync(secretPath, "utf8").trim();
unlinkSync(secretPath);

if (!secret.startsWith("whsec_")) {
  console.error("ABORT: secret does not start with whsec_");
  process.exit(1);
}

let txt = readFileSync(envPath, "utf8");
const line = `DODO_WEBHOOK_SECRET=${secret}`;

if (/^DODO_WEBHOOK_SECRET=.*$/m.test(txt)) {
  txt = txt.replace(/^DODO_WEBHOOK_SECRET=.*$/m, line);
} else {
  txt = `${txt}${txt.endsWith("\n") ? "" : "\n"}${line}\n`;
}

writeFileSync(envPath, txt);
console.log(`DODO_WEBHOOK_SECRET written, ${secret.length} chars`);

/* eslint-disable @typescript-eslint/no-require-imports */

const nodemailer = require("nodemailer");

/**
 * Email is optional: without AUTH_EMAIL_SERVER_HOST the app runs fine and
 * simply does not send. Callers check this before promising a message.
 */
export function hasEmailConfig() {
  return Boolean(process.env.AUTH_EMAIL_SERVER_HOST);
}

export const emailTransport = hasEmailConfig()
  ? nodemailer.createTransport({
      host: process.env.AUTH_EMAIL_SERVER_HOST!,
      port: Number(process.env.AUTH_EMAIL_SERVER_PORT) || 587,
      secure: process.env.AUTH_EMAIL_SERVER_SECURE === "true",
      auth: {
        user: process.env.AUTH_EMAIL_SERVER_USER!,
        pass: process.env.AUTH_EMAIL_SERVER_PASS!,
      },
    })
  : nodemailer.createTransport({ jsonTransport: true });

export const emailFrom = process.env.AUTH_EMAIL_FROM ?? "aryaanchavan1@gmail.com";

/**
 * Send one message. Returns whether it actually went out, and never throws:
 * every caller reaches here after money has moved, where a mail outage must not
 * turn a settled payment into a retried webhook or a 500 for the buyer.
 */
export async function sendMail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<boolean> {
  if (!hasEmailConfig()) {
    console.warn("[email] AUTH_EMAIL_SERVER_HOST is unset - nothing sent");
    return false;
  }
  try {
    await emailTransport.sendMail({ from: emailFrom, ...input });
    return true;
  } catch (err) {
    console.error("[email] send failed", err);
    return false;
  }
}


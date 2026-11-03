/* eslint-disable @typescript-eslint/no-require-imports */

const nodemailer = require("nodemailer");

function hasEmailConfig() {
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

export const emailFrom = process.env.AUTH_EMAIL_FROM ?? "noreply@example.com";


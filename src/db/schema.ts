import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  doublePrecision,
  numeric,
  date,
} from "drizzle-orm/pg-core";

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull(),
  price: integer("price").notNull().default(0),
  oldPrice: integer("old_price"),
  image: text("image").notNull().default(""),
  rating: doublePrecision("rating").notNull().default(0),
  reviews: integer("reviews").notNull().default(0),
  badge: text("badge").notNull().default(""),
  deployment: text("deployment").notNull().default(""),
  usersIncluded: text("users_included").notNull().default(""),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  modules: jsonb("modules").$type<string[]>().notNull().default([]),
});
export type Product = typeof products.$inferSelect;
export type NewProduct = typeof products.$inferInsert;

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  company: text("company"),
  address: text("address"),
  fingerprint: text("fingerprint"),
  status: text("status").notNull().default("pending"), // pending|authorized|paid|failed|refunded
  captureMethod: text("capture_method").notNull().default("automatic"),
  stripeSessionId: text("stripe_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  nextRetryAt: timestamp("next_retry_at"),
  retryCount: integer("retry_count").notNull().default(0),
  subtotal: integer("subtotal"),
  gst: integer("gst"),
  total: integer("total").notNull(),
  items: jsonb("items").$type<OrderLineItem[]>().notNull().default([]),
  invoiceNumber: text("invoice_number"),

  // Fraud prevention and E2E encryption fields
  ipEncrypted: text("ip_encrypted"), // Base64-encoded encrypted IP with IV
  userAgentEncrypted: text("user_agent_encrypted"), // Base64-encoded encrypted UA
  binEncrypted: text("bin_encrypted"), // Base64-encoded encrypted BIN
  metadataEncrypted: text("metadata_encrypted"), // Base64-encoded encrypted metadata JSON
  encryptionKeyVersion: integer("encryption_key_version").default(1),

  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type Order = typeof orders.$inferSelect;
export type NewOrder = typeof orders.$inferInsert;
export type OrderLineItem = {
  slug: string;
  name: string;
  price: number;
  qty: number;
  image?: string | null;
  licenseKey?: string;
};

export const payments = pgTable("payments", {
  id: serial("id").primaryKey(),
  orderId: numeric("order_id").notNull(),
  amount: integer("amount").notNull().default(0),
  currency: text("currency").notNull().default("inr"),
  status: text("status").notNull().default("pending"), // pending|authorized|captured|attempted
  statusReason: text("status_reason"),
  captureMethod: text("capture_method").notNull().default("automatic"),
  attempt: integer("attempt").default(1),
  provider: text("provider").notNull().default("stripe"),
  providerCheckoutRef: text("provider_checkout_ref"),
  providerPaymentRef: text("provider_payment_ref"),
  clientIp: text("client_ip"),
  userAgent: text("user_agent"),
  stripeRiskLevel: text("stripe_risk_level"),
  stripeRiskScore: integer("stripe_risk_score"),
  isFraudulent: boolean("is_fraudulent").default(false),
  country: text("country"),
  brand: text("brand"),
  last4: text("last4"),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  // Fraud tracking fields
  bin: text("bin"), // First 6 digits of card BIN
  binCountry: text("bin_country"), // Country of BIN issuer
  paymentMethodType: text("payment_method_type"), // card, us_bank_account, etc.
  cvvAvailable: boolean("cvv_available").default(true), // Whether CVV check was available
  isHighValueBinPriority: boolean("is_high_value_bin_priority").default(false), // BIN prioritized for high-value txns
  fraudScore: integer("fraud_score"), // Calculated fraud risk score (0-100)
  stepUpRequired: boolean("step_up_required").default(false), // Whether 3DS/step-up auth required
  geoValidated: boolean("geo_validated").default(false), // Whether IP geo was validated against cardholder
  geoRiskLevel: text("geo_risk_level"), // low|medium|high
});
export type Payment = typeof payments.$inferSelect;
export type NewPayment = typeof payments.$inferInsert;

export const fraudEvents = pgTable("fraud_events", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"), // Optional link to order
  eventType: text("event_type").notNull(), // decline|chargeback|fraud_alert|key_rotation|bin_routing_change|ip_locked|...
  severity: text("severity").notNull(), // low|medium|high|critical
  description: text("description"), // Human-readable description
  payload: text("payload"), // JSON-encoded event details (may be encrypted)
  ip: text("ip"), // IP address associated with event
  userAgent: text("user_agent"), // User-Agent associated with event
  source: text("source").notNull().default("system"), // system|manual|webhook|api
  resolved: boolean("resolved").default(false),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
export type FraudEvent = typeof fraudEvents.$inferSelect;
export type NewFraudEvent = typeof fraudEvents.$inferInsert;

export const encryptionKeys = pgTable("encryption_keys", {
  id: serial("id").primaryKey(),
  keyVersion: integer("key_version").notNull(),
  keyMaterial: text("key_material").notNull(), // Hex-encoded AES-256 key material
  salt: text("salt").notNull(), // Salt used for key derivation
  keyHash: text("key_hash").notNull(), // SHA-256 hash of key material for verification
  isPrimary: boolean("is_primary").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"), // When this key version should be rotated
});
export type EncryptionKey = typeof encryptionKeys.$inferSelect;
export type NewEncryptionKey = typeof encryptionKeys.$inferInsert;

export const siteFlags = pgTable("site_flags", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type SiteFlag = typeof siteFlags.$inferSelect;

// ---------------------------------------------------------------------------
// Legacy type exports (for backward compatibility)
// ---------------------------------------------------------------------------

export type { Stripe } from "stripe";

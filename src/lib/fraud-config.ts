// ---------------------------------------------------------------------------
// BIN Routing Strategies
// ---------------------------------------------------------------------------

export interface BINRoutingRule {
  bin: string;
  action: "allow" | "manual_review" | "block" | "high_value_only";
  reason: string;
  lastUpdated: Date;
  fraudEventId?: number;
}

export const BIN_ROUTING_STRATEGIES = {
  // BIN rules loaded dynamically from database; this is the initial in-memory cache
  binRules: new Map<string, BINRoutingRule>(),

  // Thresholds for BIN routing decisions
  highValueThreshold: 50000, // ₹50,000 - prioritize BINs for high-value transactions
  criticalThreshold: 100000, // ₹100,000 - critical value requiring additional checks

  // BIN lists (in production, these would be loaded from a database or external service)
  trustedBins: [
    "4532", // Visa (example)
    "5411", // Mastercard (example)
  ],

  blockedBins: [] as Array<string>,
  // Add BINs that have been identified as high-risk in production.
  // These should be loaded from a database or external fraud list.

  // CVV check detection
  cvvDisabledPaymentTypes: [
    "card", // When Stripe disables CVV for card payments
  ],

  // BIN countries that require enhanced verification
  highRiskBINCountries: [
    "NG", // Nigeria
    "KE", // Kenya
    "GH", // Ghana
  ],
};

// ---------------------------------------------------------------------------
// Risk Thresholds
// ---------------------------------------------------------------------------

export const HIGH_RISK_COUNTRIES = [
  "PK", // Pakistan
  "AF", // Afghanistan
  "SY", // Syria
  "MM", // Myanmar
  "IR", // Iran
  "KP", // North Korea
  "NG", // Nigeria
  "RU", // Russia
];

export const FRAUD_SCORE_THRESHOLDS = {
  low: 0, // 0-39
  medium: 40, // 40-59
  high: 60, // 60-79
  critical: 80, // 80-100
};

export const IP_VELOCITY_LIMIT = 3; // Max transactions per IP in 24 hours
export const GEO_MATCH_THRESHOLD = 0.8; // 80% geo match required

// ---------------------------------------------------------------------------
// Webhook Configuration
// ---------------------------------------------------------------------------

export interface WebhookDestination {
  url: string;
  severity: "low" | "medium" | "high" | "critical" | "all";
  events: string[];
  secret?: string;
}

export const WEBHOOK_DESTINATIONS: WebhookDestination[] = [
  // Monitoring service for declined transactions, chargebacks, account health
  {
    url: process.env.FRAUD_WEBHOOK_URL || "https://hooks.example.com/fraud",
    severity: "medium",
    events: [
      "payment_intent.declined",
      "charge.disputed",
      "charge.refunded",
      "account.updated",
      "fraud.detected",
      "key_rotation",
    ],
  },
  // High-severity alerts (Slack, PagerDuty, etc.)
  {
    url: process.env.FRAUD_ALERT_URL || "https://hooks.slack.com/services/example",
    severity: "high",
    events: [
      "payment_intent.declined",
      "charge.disputed",
      "fraud.detected",
      "bin_routing_change",
      "ip_locked",
    ],
  },
  // Critical alerts (SMS, phone call, etc.)
  {
    url: process.env.FRAUD_CRITICAL_URL || "",
    severity: "critical",
    events: [
      "charge.disputed",
      "fraud.detected",
      "ip_locked",
    ],
  },
];

// ---------------------------------------------------------------------------
// Encryption Configuration
// ---------------------------------------------------------------------------

export const ENCRYPTION_KEY_CIPHER = "aes-256-gcm";
export const ENCRYPTION_KEY_SCHEDULE_DAYS = 7; // Weekly rotation

// ---------------------------------------------------------------------------
// Stripe Payment Method Monitoring
// ---------------------------------------------------------------------------

export interface PaymentMethodConfig {
  type: string;
  cvvAvailable: boolean;
  threeDSecureAvailable: boolean;
  lastChecked: Date;
}

export const PAYMENT_METHOD_MONITORING = {
  // Payment methods to monitor for CVV/3DS availability
  monitoredTypes: ["card"],

  // When CVV is disabled, prioritize these BINs for high-value transactions
  cvvDisabledAction: "prioritize_high_value_bins",

  // Check frequency (in production, poll Stripe API periodically)
  checkIntervalMs: 60 * 60 * 1000, // 1 hour
};

// ---------------------------------------------------------------------------
// Residential Proxy Configuration
// ---------------------------------------------------------------------------

export interface ProxyConfig {
  provider: "bright_data" | "oxylabs" | "smart_proxy" | "custom";
  apiKey?: string;
  rotationEnabled: boolean;
  geoMatchingEnabled: boolean;
  maxConcurrentSessions: number;
}

export const PROXY_CONFIG: ProxyConfig = {
  provider: "bright_data",
  apiKey: process.env.BRIGHT_DATA_API_KEY,
  rotationEnabled: true,
  geoMatchingEnabled: true,
  maxConcurrentSessions: 5,
};

// ---------------------------------------------------------------------------
// Transaction Pattern Configuration
// ---------------------------------------------------------------------------

export const TRANSACTION_PATTERNS = {
  // Default transaction patterns
  defaultPatterns: {
    rotationPerTransaction: true,
    ruralIPRatio: 0.4,
    geoStrictness: "strict" as const,
    maxConcurrentSessions: 5,
  },

  // Pattern adjustments based on feedback
  adjustments: {
    highDeclineRate: {
      rotationPerTransaction: true,
      geoStrictness: "strict" as const,
      maxConcurrentSessions: 3,
    },
    highChargebackRate: {
      rotationPerTransaction: true,
      geoStrictness: "strict" as const,
      maxConcurrentSessions: 2,
    },
    highFraudDetection: {
      rotationPerTransaction: true,
      geoStrictness: "strict" as const,
      maxConcurrentSessions: 1,
      lockIPs: true,
    },
  },
};

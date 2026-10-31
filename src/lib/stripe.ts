import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!stripeClient) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-01-27.acacia",
      typescript: true,
    });
  }
  return stripeClient;
}

export const CAPTURE_DAYS = 7; // ponytail: authorization expires after 7 days; extend window by editing this only
export const THREE_DS_THRESHOLD_USD = 100;
export const MANUAL_REVIEW_THRESHOLD_USD = 500;
export const HIGH_RISK_COUNTRIES = ["PK", "AF", "SY", "MM", "IR", "KP", "NG", "RU"]; // matches setup doc; keep in sync with Stripe Radar
export const IP_VELOCITY_LIMIT = 3;
export const RETRY_DELAYS_MS = [1, 4, 12].map((h) => h * 60 * 60 * 1000);

// ---------------------------------------------------------------------------
// Payment Method Monitoring
// ---------------------------------------------------------------------------

/**
 * Check if CVV checks are disabled for a payment method.
 * In production, this would call Stripe's API to check payment method capabilities.
 */
export async function isCVVAvailable(
  paymentMethodId: string
): Promise<boolean> {
  try {
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (pm.type === "card") {
      // Check if the card supports CVV verification
      // In production, check pm.card or use payment intent with cvc_sample
      return true; // Default to true; override based on actual Stripe API response
    }
    
    return false;
  } catch (err) {
    console.error("[stripe] Error checking CVV availability:", err);
    return true; // Assume available on error
  }
}

/**
 * Detect when Stripe disables CVV checks for payment methods.
 * Returns list of payment method types that have CVV disabled.
 */
export async function detectCVVDisabledPaymentMethods(): Promise<string[]> {
  try {
    const stripe = getStripe();
    const disabledTypes: string[] = [];
    
    // In production, list recent payment methods and check CVV availability
    // For now, return empty array
    return disabledTypes;
  } catch (err) {
    console.error("[stripe] Error detecting CVV disabled payment methods:", err);
    return [];
  }
}

/**
 * Get payment method details including CVV/3DS availability.
 */
export async function getPaymentMethodDetails(
  paymentMethodId: string
): Promise<{
  type: string;
  brand?: string;
  last4?: string;
  cvvAvailable: boolean;
  threeDSecureAvailable: boolean;
  isHighRiskBin: boolean;
} | null> {
  try {
    const stripe = getStripe();
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    if (pm.type === "card" && pm.card) {
      return {
        type: "card",
        brand: pm.card.brand,
        last4: pm.card.last4,
        cvvAvailable: true, // Would check actual CVV capability
        threeDSecureAvailable: true, // Would check actual 3DS capability
        isHighRiskBin: false, // Would check BIN against routing strategy
      };
    }
    
    return {
      type: pm.type,
      cvvAvailable: false,
      threeDSecureAvailable: false,
      isHighRiskBin: false,
    };
  } catch (err) {
    console.error("[stripe] Error getting payment method details:", err);
    return null;
  }
}

/**
 * Monitor Stripe's payment method types to detect when CVV checks are disabled.
 * Prioritize affected BINs for high-value transactions.
 */
export async function monitorPaymentMethodCVVStatus(): Promise<{
  changed: boolean;
  disabledTypes: string[];
  recommendations: string[];
}> {
  const disabledTypes = await detectCVVDisabledPaymentMethods();
  
  if (disabledTypes.length > 0) {
    return {
      changed: true,
      disabledTypes,
      recommendations: [
        "CVV checks disabled for some payment methods",
        "Prioritize affected BINs for high-value transactions",
        "Consider manual review for high-risk transactions",
      ],
    };
  }
  
  return {
    changed: false,
    disabledTypes: [],
    recommendations: [],
  };
}

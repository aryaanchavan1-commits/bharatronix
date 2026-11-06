"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart-provider";

/**
 * The cart is deliberately kept through the payment redirect so a declined card
 * can be retried without re-adding anything. Once the order page shows a paid
 * order, the basket has done its job and is emptied here.
 */
export function ClearCart() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}

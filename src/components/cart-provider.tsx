"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

export type CartItem = {
  slug: string;
  name: string;
  price: number;
  image: string;
  qty: number;
};

type CartContextValue = {
  items: CartItem[];
  count: number;
  subtotal: number;
  addItem: (item: Omit<CartItem, "qty">, qty?: number) => void;
  removeItem: (slug: string) => void;
  setQty: (slug: string, qty: number) => void;
  clear: () => void;
  lastAdded: string | null;
};

const STORAGE_KEY = "bharatronix-cart-v1";
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let snapshot: CartItem[] | null = null;

function read(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
  } catch {
    return EMPTY;
  }
}

function commit(next: CartItem[]) {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage full or unavailable — cart still works for this session */
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): CartItem[] {
  if (snapshot === null) snapshot = read();
  return snapshot;
}

function getServerSnapshot(): CartItem[] {
  return EMPTY;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const items = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [lastAdded, setLastAdded] = useState<string | null>(null);

  const addItem = useCallback((item: Omit<CartItem, "qty">, qty = 1) => {
    const prev = getSnapshot();
    const existing = prev.find((i) => i.slug === item.slug);
    commit(
      existing
        ? prev.map((i) =>
            i.slug === item.slug ? { ...i, qty: Math.min(i.qty + qty, 99) } : i
          )
        : [...prev, { ...item, qty }]
    );
    setLastAdded(item.slug);
    setTimeout(() => setLastAdded(null), 2200);
  }, []);

  const removeItem = useCallback((slug: string) => {
    commit(getSnapshot().filter((i) => i.slug !== slug));
  }, []);

  const setQty = useCallback((slug: string, qty: number) => {
    commit(
      qty <= 0
        ? getSnapshot().filter((i) => i.slug !== slug)
        : getSnapshot().map((i) =>
            i.slug === slug ? { ...i, qty: Math.min(qty, 99) } : i
          )
    );
  }, []);

  const clear = useCallback(() => commit(EMPTY), []);

  const value = useMemo<CartContextValue>(() => {
    const count = items.reduce((s, i) => s + i.qty, 0);
    const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    return { items, count, subtotal, addItem, removeItem, setQty, clear, lastAdded };
  }, [items, addItem, removeItem, setQty, clear, lastAdded]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
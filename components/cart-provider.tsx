"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Beat } from "@/lib/types";

type CartContextValue = {
  items: Beat[];
  total: number;
  add: (beat: Beat) => void;
  remove: (id: string) => void;
  clear: () => void;
  has: (id: string) => boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Beat[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ye2k-cart");
      if (saved) setItems(JSON.parse(saved));
    } finally { setLoaded(true); }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem("ye2k-cart", JSON.stringify(items));
  }, [items, loaded]);

  const value = useMemo(() => ({
    items,
    total: items.reduce((sum, item) => sum + Number(item.price), 0),
    add: (beat: Beat) => setItems(current => current.some(item => item.id === beat.id) ? current : [...current, beat]),
    remove: (id: string) => setItems(current => current.filter(item => item.id !== id)),
    clear: () => setItems([]),
    has: (id: string) => items.some(item => item.id === id)
  }), [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}

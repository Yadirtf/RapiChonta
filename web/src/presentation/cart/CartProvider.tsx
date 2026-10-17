"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { addToCart, parseStoredCart, setQuantity, type Cart, type CartLine } from "@/core/domain/entities/cart";

const STORAGE_KEY = "rc_cart_v1";

/**
 * Canasta guardada en el navegador (sobrevive a recargas y se sincroniza entre pestañas). No guarda datos
 * personales: solo productos y cantidades. Se envía a la API recién al confirmar el pedido (E04).
 */
const store = (() => {
  let cart: Cart | null = null;
  let loaded = false;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const read = () => {
    try {
      return parseStoredCart(window.localStorage.getItem(STORAGE_KEY));
    } catch {
      return null;
    }
  };
  return {
    get(): Cart | null {
      if (!loaded && typeof window !== "undefined") {
        cart = read();
        loaded = true;
      }
      return cart;
    },
    set(next: Cart | null) {
      cart = next;
      loaded = true;
      try {
        if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        else window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        // Navegación privada o almacenamiento lleno: la canasta sigue en memoria.
      }
      emit();
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      const onStorage = (event: StorageEvent) => {
        if (event.key !== STORAGE_KEY) return;
        cart = read();
        emit();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", onStorage);
      };
    },
  };
})();

interface CartContextValue {
  cart: Cart | null;
  add(establishment: { id: string; name: string }, line: Omit<CartLine, "quantity">): void;
  setQuantity(productId: string, quantity: number): void;
  replace(cart: Cart | null): void;
  clear(): void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const cart = useSyncExternalStore(store.subscribe, store.get, () => null);
  const add = useCallback<CartContextValue["add"]>((establishment, line) => store.set(addToCart(store.get(), establishment, line)), []);
  const changeQuantity = useCallback((productId: string, quantity: number) => {
    const current = store.get();
    if (current) store.set(setQuantity(current, productId, quantity));
  }, []);
  const replace = useCallback((next: Cart | null) => store.set(next), []);
  const clear = useCallback(() => store.set(null), []);
  const value = useMemo(() => ({ cart, add, setQuantity: changeQuantity, replace, clear }), [cart, add, changeQuantity, replace, clear]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const value = useContext(CartContext);
  if (!value) throw new Error("useCart fuera de CartProvider");
  return value;
}

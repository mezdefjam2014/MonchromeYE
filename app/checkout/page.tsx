"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useCart } from "@/components/cart-provider";

export default function CheckoutPage() {
  const { items, total } = useCart();
  const siteSlug = useMemo(
    () => items[0]?.site_slug || "ye2k",
    [items]
  );
  const storeHref = siteSlug === "ye2k" ? "/" : `/s/${siteSlug}`;
  const [checkoutError, setCheckoutError] = useState("");
  const [loading, setLoading] = useState(false);

  async function beginCheckout() {
    if (items.length === 0 || loading) return;

    setCheckoutError("");
    setLoading(true);

    try {
      const response = await fetch("/api/stripe/create-checkout-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          beatIds: items.map((item) => item.id),
          siteSlug
        })
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || !data.url) {
        throw new Error(
          data.error || "Stripe checkout could not be started."
        );
      }

      window.location.assign(data.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Stripe checkout could not be started."
      );
      setLoading(false);
    }
  }

  return (
    <main className="checkout-page">
      <Link href={storeHref} className="back-link">
        ← Back to store
      </Link>

      <section className="checkout-card">
        <p className="eyebrow">SECURE CHECKOUT</p>
        <h1>Complete your order</h1>

        <div className="checkout-items">
          {items.map((item) => (
            <div key={item.id}>
              <span>{item.title}</span>
              <strong>${Number(item.price).toFixed(2)}</strong>
            </div>
          ))}
        </div>

        <div className="checkout-total">
          <span>Total</span>
          <strong>${total.toFixed(2)}</strong>
        </div>

        {checkoutError && (
          <div className="stripe-error" role="alert">
            <strong>Checkout could not start.</strong>
            <span>{checkoutError}</span>
          </div>
        )}

        {items.length > 0 ? (
          <button
            className="stripe-checkout-btn"
            onClick={beginCheckout}
            disabled={loading}
          >
            <span>{loading ? "Opening secure checkout…" : "Pay securely with Stripe"}</span>
            <b>→</b>
          </button>
        ) : (
          <p className="form-message">
            Your cart is empty.
          </p>
        )}

        <p className="stripe-secure-note">
          Card details are entered securely on Stripe Checkout.
        </p>
      </section>
    </main>
  );
}

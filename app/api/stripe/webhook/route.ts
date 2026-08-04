import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

async function completeOrder(session: Stripe.Checkout.Session) {
  const internalOrderId =
    session.metadata?.internal_order_id ||
    session.client_reference_id;

  if (!internalOrderId) {
    throw new Error("Stripe session is missing the internal order ID.");
  }

  if (session.payment_status !== "paid") {
    return;
  }

  const supabase = createAdminClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,total,currency,payment_status")
    .eq("id", internalOrderId)
    .eq("stripe_session_id", session.id)
    .maybeSingle();

  if (orderError || !order) {
    throw new Error("The matching YE2K order was not found.");
  }

  const expectedAmount = Math.round(Number(order.total) * 100);
  const expectedCurrency = String(order.currency || "").toLowerCase();

  if (
    session.amount_total !== expectedAmount ||
    session.currency !== expectedCurrency
  ) {
    throw new Error("Stripe payment amount does not match the YE2K order.");
  }

  const customerName =
    session.customer_details?.name ||
    session.customer_details?.email ||
    null;

  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      payment_status: "completed",
      stripe_payment_intent_id: paymentIntentId,
      customer_email: session.customer_details?.email || null,
      customer_name: customerName,
      updated_at: new Date().toISOString()
    })
    .eq("id", internalOrderId)
    .eq("stripe_session_id", session.id);

  if (updateError) {
    throw new Error(`Could not complete the YE2K order: ${updateError.message}`);
  }
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: "Webhook signature configuration is missing." },
      { status: 400 }
    );
  }

  const payload = await request.text();
  const stripe = getStripe();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error);
    return NextResponse.json(
      { error: "Invalid Stripe webhook signature." },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await completeOrder(event.data.object as Stripe.Checkout.Session);
        break;

      case "checkout.session.expired": {
        const session = event.data.object as Stripe.Checkout.Session;
        const internalOrderId =
          session.metadata?.internal_order_id ||
          session.client_reference_id;

        if (internalOrderId) {
          const supabase = createAdminClient();
          await supabase
            .from("orders")
            .update({
              payment_status: "expired",
              updated_at: new Date().toISOString()
            })
            .eq("id", internalOrderId)
            .eq("stripe_session_id", session.id)
            .eq("payment_status", "pending");
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        const internalOrderId = paymentIntent.metadata?.internal_order_id;

        if (internalOrderId) {
          const supabase = createAdminClient();
          await supabase
            .from("orders")
            .update({
              payment_status: "failed",
              stripe_payment_intent_id: paymentIntent.id,
              updated_at: new Date().toISOString()
            })
            .eq("id", internalOrderId)
            .eq("payment_status", "pending");
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error(`Stripe webhook handling failed for ${event.type}:`, error);

    return NextResponse.json(
      { error: "Stripe webhook processing failed." },
      { status: 500 }
    );
  }
}

-- YE2K Stripe order migration
-- Run in Supabase Dashboard → SQL Editor → New Query → Paste → Run.
-- Additive and non-destructive. Existing PayPal rows are preserved.

alter table public.orders
  alter column paypal_order_id drop not null;

alter table public.orders
  add column if not exists payment_provider text;

alter table public.orders
  add column if not exists stripe_session_id text;

alter table public.orders
  add column if not exists stripe_payment_intent_id text;

alter table public.orders
  add column if not exists download_token_hash text;

alter table public.orders
  add column if not exists updated_at timestamptz not null default now();

update public.orders
set payment_provider = 'paypal'
where payment_provider is null
  and paypal_order_id is not null;

create unique index if not exists orders_stripe_session_unique_idx
on public.orders(stripe_session_id)
where stripe_session_id is not null;

create index if not exists orders_stripe_payment_intent_idx
on public.orders(stripe_payment_intent_id)
where stripe_payment_intent_id is not null;

create index if not exists orders_provider_status_idx
on public.orders(payment_provider, payment_status, created_at desc);

-- Subscription checkout and monthly credit ledger (issue #23).
--
-- A logged-in user can subscribe to the app's single paid tier via Stripe
-- Checkout. A Stripe webhook -- never the client -- is the only thing that
-- marks a subscription active and grants that billing period's credits.
--
-- Credits are an append-only ledger, one row per grant/consume/refund event,
-- rather than a single mutable counter: the current balance is always
-- derivable by summing this period's rows, so a refund (added by #25) is
-- just another row, never a retroactive edit to a stored total.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  stripe_customer_id text not null,
  stripe_subscription_id text not null unique,
  status text not null check (status in ('active', 'canceled', 'past_due')),
  current_period_start timestamptz not null,
  current_period_end timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

-- Only the service role -- used exclusively by the Stripe webhook handler --
-- writes this table, so RLS grants no insert/update/delete policy to any
-- other role. A user may read only their own row.
create policy "Users can read their own subscription"
  on public.subscriptions for select
  using (auth.uid() = user_id);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null,
  reason text not null check (reason in ('monthly_grant', 'detailed_report_consume', 'refund')),
  billing_period_start timestamptz not null,
  billing_period_end timestamptz not null,
  -- Set for a consume/refund row (#25); left null for a monthly_grant, which
  -- isn't tied to any one Report.
  report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.credit_ledger enable row level security;

-- Same split as subscriptions: written only by the service role (the
-- webhook grants credits here; #25's analyze flow will consume/refund them),
-- readable only by the user the row belongs to.
create policy "Users can read their own credit ledger entries"
  on public.credit_ledger for select
  using (auth.uid() = user_id);

create index if not exists credit_ledger_user_period_idx
  on public.credit_ledger (user_id, billing_period_start);

-- Stripe redelivers webhooks (e.g. both checkout.session.completed and the
-- first invoice.paid can grant the same period), so a monthly_grant for a
-- period a user already has one for is rejected at the database level. The
-- application layer treats the resulting unique-violation as a no-op rather
-- than an error -- see grantMonthlyCredits in subscriptions-repo.ts.
create unique index if not exists credit_ledger_one_monthly_grant_per_period_idx
  on public.credit_ledger (user_id, billing_period_start)
  where reason = 'monthly_grant';

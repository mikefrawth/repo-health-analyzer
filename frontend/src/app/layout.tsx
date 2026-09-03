import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";
import { AuthControls } from "@/components/AuthControls";
import { SubscriptionStatus } from "@/components/SubscriptionStatus";
import { githubUsername } from "@/lib/user-profile";
import { serverClient } from "@/lib/supabase-server";
import { creditBalance } from "@/lib/subscription";
import {
  fetchOwnLedgerForPeriod,
  fetchOwnSubscription,
  type SubscriptionRow,
} from "@/lib/subscriptions-repo";

export const metadata: Metadata = {
  title: "Repo Health Analyzer",
  description:
    "Analyze a public GitHub repository and get a deterministic Health Score, " +
    "the Metrics behind it, and a plain-language summary.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const {
    data: { user },
  } = await serverClient().auth.getUser();

  let subscription: SubscriptionRow | null = null;
  let balance: number | null = null;
  if (user) {
    subscription = await fetchOwnSubscription();
    if (subscription?.status === "active") {
      const ledger = await fetchOwnLedgerForPeriod(subscription.current_period_start);
      balance = creditBalance(ledger, subscription.current_period_start);
    }
  }

  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <header className="border-b border-slate-200 bg-white">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              Repo Health Analyzer
            </Link>
            <div className="flex items-center gap-6">
              <a
                href="https://github.com/mikefrawth/repo-health-analyzer"
                target="_blank"
                rel="noreferrer"
                className="text-sm text-slate-500 transition-colors hover:text-slate-900"
              >
                Source
              </a>
              {user && <SubscriptionStatus status={subscription?.status ?? null} balance={balance} />}
              <AuthControls githubUsername={user ? githubUsername(user) : null} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-6 py-10">{children}</main>
        <footer className="mx-auto max-w-5xl px-6 pb-10 pt-4 text-xs text-slate-400">
          The Health Score is computed deterministically from the Metrics. The AI
          summary is written from those same Metrics and never changes the score.
        </footer>
      </body>
    </html>
  );
}

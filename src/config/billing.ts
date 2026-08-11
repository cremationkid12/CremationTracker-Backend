/** Per-case billing after free live credits. Price TBD ($6.99–$9.99); default $7.99. */

export function freeLiveCasesPerOrg(): number {
  const n = Number(process.env.FREE_LIVE_CASES_PER_ORG ?? 3);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 3;
}

export function casePriceCents(): number {
  const n = Number(process.env.CASE_PRICE_CENTS ?? 799);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 799;
}

export function stripeSecretKey(): string | null {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return key ? key : null;
}

export function stripeWebhookSecret(): string | null {
  const key = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return key ? key : null;
}

/** When Stripe is unset, mock pay is allowed unless NODE_ENV=production and ALLOW_MOCK_BILLING=false. */
export function allowMockBilling(): boolean {
  if (stripeSecretKey()) return false;
  if (process.env.ALLOW_MOCK_BILLING === "true") return true;
  if (process.env.ALLOW_MOCK_BILLING === "false") return false;
  return process.env.NODE_ENV !== "production";
}

export function billingSuccessUrl(): string {
  return (
    process.env.BILLING_SUCCESS_URL?.trim() ||
    "https://cremationtracker.app/billing/success"
  );
}

export function billingCancelUrl(): string {
  return (
    process.env.BILLING_CANCEL_URL?.trim() ||
    "https://cremationtracker.app/billing/cancel"
  );
}

export function formatCasePriceLabel(cents = casePriceCents()): string {
  return `$${(cents / 100).toFixed(2)}`;
}

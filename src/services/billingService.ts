import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import {
  allowMockBilling,
  billingCancelUrl,
  billingSuccessUrl,
  casePriceCents,
  formatCasePriceLabel,
  stripeSecretKey,
  stripeWebhookSecret,
} from "../config/billing";
import {
  CaseServiceError,
  type CaseDetail,
  type CaseService,
  type OrgCredits,
} from "./caseService";

export type CheckoutResult =
  | {
      provider: "stripe";
      checkout_url: string;
      session_id: string;
      case_price_cents: number;
      case_price_label: string;
    }
  | {
      provider: "mock";
      checkout_url: null;
      session_id: string;
      case_price_cents: number;
      case_price_label: string;
      case: CaseDetail;
    };

export type BillingService = {
  getCredits: (orgId: string) => Promise<OrgCredits>;
  startCheckout: (input: {
    orgId: string;
    orgType: string;
    caseId: string;
  }) => Promise<CheckoutResult>;
  handleStripeWebhook: (rawBody: Buffer, signature: string | undefined) => Promise<void>;
};

let stripeClient: Stripe | null = null;

function getStripe(): Stripe {
  const key = stripeSecretKey();
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!stripeClient) {
    stripeClient = new Stripe(key);
  }
  return stripeClient;
}

export function createBillingService(caseService: CaseService): BillingService {
  return {
    async getCredits(orgId) {
      return caseService.getOrgCredits(orgId);
    },

    async startCheckout(input) {
      if (input.orgType !== "funeral_home") {
        throw new CaseServiceError("Only funeral homes can pay for cases.", "forbidden");
      }
      const detail = await caseService.getCase(input.orgId, "funeral_home", input.caseId);
      if (!detail) throw new CaseServiceError("Case not found.", "not_found");
      if (detail.case_mode !== "live") {
        throw new CaseServiceError("Only live cases require payment.", "bad_request");
      }
      if (detail.billing_status === "paid" || detail.billing_status === "free_credit") {
        throw new CaseServiceError("Case is already unlocked.", "conflict");
      }
      if (detail.billing_status !== "pending" && detail.billing_status !== "failed") {
        throw new CaseServiceError("Case is not awaiting payment.", "conflict");
      }

      const price = casePriceCents();
      const label = formatCasePriceLabel(price);

      if (allowMockBilling()) {
        const sessionId = `mock_${randomUUID()}`;
        const activated = await caseService.activatePaidCase({
          caseId: input.caseId,
          provider: "mock",
          transactionId: sessionId,
        });
        return {
          provider: "mock",
          checkout_url: null,
          session_id: sessionId,
          case_price_cents: price,
          case_price_label: label,
          case: activated,
        };
      }

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        success_url: `${billingSuccessUrl()}?case_id=${encodeURIComponent(input.caseId)}&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${billingCancelUrl()}?case_id=${encodeURIComponent(input.caseId)}`,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "usd",
              unit_amount: price,
              product_data: {
                name: "Cremation Tracker live case",
                description: `Unlock QR/PIN for ${detail.decedent_display_name}`,
              },
            },
          },
        ],
        metadata: {
          case_id: input.caseId,
          org_id: input.orgId,
        },
      });

      if (!session.url) {
        throw new Error("Stripe checkout session did not return a URL.");
      }

      return {
        provider: "stripe",
        checkout_url: session.url,
        session_id: session.id,
        case_price_cents: price,
        case_price_label: label,
      };
    },

    async handleStripeWebhook(rawBody, signature) {
      const secret = stripeWebhookSecret();
      if (!secret) {
        throw new Error("STRIPE_WEBHOOK_SECRET is not configured.");
      }
      if (!signature) {
        throw new CaseServiceError("Missing Stripe signature.", "bad_request");
      }

      const stripe = getStripe();
      const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

      if (event.type !== "checkout.session.completed") return;

      const session = event.data.object as Stripe.Checkout.Session;
      const caseId = session.metadata?.case_id;
      if (!caseId) {
        throw new CaseServiceError("Checkout session missing case_id metadata.", "bad_request");
      }
      if (session.payment_status !== "paid" && session.status !== "complete") {
        return;
      }

      await caseService.activatePaidCase({
        caseId,
        provider: "stripe",
        transactionId: session.id,
      });
    },
  };
}

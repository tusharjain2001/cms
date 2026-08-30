import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import type { PaymentDTO } from "@pagecraft/shared";

/**
 * One row per charge Razorpay actually took. The account's billing history.
 *
 * WHY THIS EXISTS SEPARATELY FROM `user.subscription`: that sub-document holds
 * the *current* state — enough to answer "may this account own another
 * website?", which is what gates the product. It holds no history at all, so
 * without this collection a renewal would arrive every month, update a status,
 * and leave no trace that money had moved. You could not answer "when was I
 * charged and how much?" from your own database, reconcile revenue, or defend
 * a chargeback; every one of those would mean opening the Razorpay dashboard.
 *
 * **The amount is stored, not derived.** Prices change, and a subscriber
 * charged ₹1 during a settlement test must stay distinguishable from one
 * charged ₹999 a year later. Recomputing history from today's price list is
 * how billing disputes are lost.
 *
 * **Nothing here is card data.** Card numbers never reach this server —
 * Razorpay's checkout handles them — so the most sensitive field is a payment
 * id and the last-four-style `method` label ("card", "upi", "netbanking").
 */
const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /**
     * Razorpay's payment id, and the reason redeliveries are harmless: the
     * unique index makes recording a payment idempotent, so a webhook retried
     * for three days still produces exactly one row.
     */
    razorpayPaymentId: { type: String, required: true, unique: true },
    razorpaySubscriptionId: { type: String, default: null, index: true },
    razorpayInvoiceId: { type: String, default: null },
    /** In paise, exactly as Razorpay reports it. Never a float. */
    amountPaise: { type: Number, required: true },
    currency: { type: String, default: "INR" },
    /** Razorpay's own payment state: captured, failed, authorized, refunded. */
    status: { type: String, required: true },
    /** How they paid — "card", "upi", "netbanking". Not the card itself. */
    method: { type: String, default: null },
    /** Websites covered by this charge, so an old row explains its own amount. */
    websites: { type: Number, default: null },
    period: { type: String, default: null },
    /** Razorpay's timestamp for the charge, not ours. */
    paidAt: { type: Date, required: true },
  },
  { timestamps: true }
);

/** The billing screen lists newest first, per account. */
paymentSchema.index({ userId: 1, paidAt: -1 });

export type PaymentDoc = HydratedDocument<InferSchemaType<typeof paymentSchema>>;

export const Payment = model("Payment", paymentSchema);

export interface RecordPaymentInput {
  userId: unknown;
  razorpayPaymentId: string;
  razorpaySubscriptionId?: string | null;
  razorpayInvoiceId?: string | null;
  amountPaise: number;
  currency?: string;
  status: string;
  method?: string | null;
  websites?: number | null;
  period?: string | null;
  paidAt: Date;
}

/**
 * Records a charge, idempotently.
 *
 * Upserts on the payment id so a redelivered webhook updates the row rather
 * than adding a second. Two deliveries racing can still collide on the unique
 * index; that throws E11000, which means "already recorded" and is swallowed —
 * a duplicate webhook must never fail the handler and make Razorpay retry
 * forever.
 */
export async function recordPayment(input: RecordPaymentInput): Promise<void> {
  const { razorpayPaymentId, ...rest } = input;
  try {
    await Payment.updateOne(
      { razorpayPaymentId },
      { $set: { razorpayPaymentId, ...rest } },
      { upsert: true }
    );
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

export function toPaymentDTO(p: PaymentDoc): PaymentDTO {
  return {
    id: p._id.toString(),
    razorpayPaymentId: p.razorpayPaymentId,
    amountPaise: p.amountPaise,
    currency: p.currency ?? "INR",
    status: p.status,
    method: p.method ?? null,
    websites: p.websites ?? null,
    period: p.period ?? null,
    paidAt: p.paidAt.toISOString(),
  };
}

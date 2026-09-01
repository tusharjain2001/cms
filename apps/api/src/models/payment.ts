import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";
import { CURRENCY, type PaymentDTO } from "@pagecraft/shared";

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
 * **The amount is stored, not derived, and so is its currency.** Prices change
 * — this product went ₹999 → ₹1 → ₹999 → $7.99 inside two days — so a row must
 * carry both its figure and the unit that figure is in. Recomputing history
 * from today's price list is how billing disputes are lost, and formatting an
 * old row with today's currency is how a ₹999 charge reads as "$9.99".
 *
 * `currency` is whatever Razorpay reported, never what we are charging now.
 * There is nothing to migrate today (the only INR rows were a ₹1 live-key test
 * and were deleted by hand), but the next price change should not be the thing
 * that discovers this.
 *
 * **Nothing here is card data.** Card numbers never reach this server —
 * Razorpay's checkout handles them — so the most sensitive field is a payment
 * id and the last-four-style `method` label ("card", "upi", "netbanking").
 */
const paymentSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    /**
     * The payment provider's id for this charge, and the reason redeliveries
     * are harmless: the unique index makes recording a payment idempotent, so a
     * webhook retried for three days still produces exactly one row.
     *
     * Named for the role, not the vendor — it held Razorpay ids before the move
     * to Dodo Payments and will hold whoever's comes next.
     */
    providerPaymentId: { type: String, required: true, unique: true },
    providerSubscriptionId: { type: String, default: null, index: true },
    /**
     * In the minor unit of `currency` (cents for USD, paise for INR), exactly
     * as Razorpay reports it. Never a float.
     */
    amountMinor: { type: Number, required: true },
    /**
     * Whatever Razorpay charged in. The default is only a safety net —
     * `recordPayment` always passes the currency Razorpay reported — but it
     * tracks `CURRENCY` rather than being written out, so a future currency
     * change cannot leave a row silently labelled with the old one.
     */
    currency: { type: String, default: CURRENCY },
    /** The provider's own payment state: succeeded, failed, refunded. */
    status: { type: String, required: true },
    /** How they paid — "card", "upi", "netbanking". Not the card itself. */
    method: { type: String, default: null },
    /** Websites covered by this charge, so an old row explains its own amount. */
    websites: { type: Number, default: null },
    period: { type: String, default: null },
    /** The provider's timestamp for the charge, not ours. */
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
  providerPaymentId: string;
  providerSubscriptionId?: string | null;
  amountMinor: number;
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
  const { providerPaymentId, ...rest } = input;
  try {
    await Payment.updateOne(
      { providerPaymentId },
      { $set: { providerPaymentId, ...rest } },
      { upsert: true }
    );
  } catch (err) {
    if ((err as { code?: number }).code !== 11000) throw err;
  }
}

export function toPaymentDTO(p: PaymentDoc): PaymentDTO {
  return {
    id: p._id.toString(),
    providerPaymentId: p.providerPaymentId,
    amountMinor: p.amountMinor,
    currency: p.currency ?? CURRENCY,
    status: p.status,
    method: p.method ?? null,
    websites: p.websites ?? null,
    period: p.period ?? null,
    paidAt: p.paidAt.toISOString(),
  };
}

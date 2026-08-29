import { Schema, model, type HydratedDocument, type InferSchemaType } from "mongoose";

/**
 * One row per website per calendar month, counting content-API requests.
 *
 * This is the meter behind the "API calls / month" quota. It is incremented
 * atomically with `$inc` on an upsert, so concurrent requests can't lose a
 * count, and it costs one write per *origin* content hit — real client sites
 * are CDN-cached (the content routes set `s-maxage`), so that stays low.
 *
 * `period` is `YYYY-MM` (UTC), which makes "this month" a plain equality match
 * and old rows trivially prunable later.
 */
const usageSchema = new Schema({
  projectId: { type: Schema.Types.ObjectId, ref: "Project", required: true },
  period: { type: String, required: true }, // "2026-08"
  apiCalls: { type: Number, default: 0 },
});

usageSchema.index({ projectId: 1, period: 1 }, { unique: true });

export type UsageDoc = HydratedDocument<InferSchemaType<typeof usageSchema>>;

export const Usage = model("Usage", usageSchema);

/** The current UTC period key, e.g. "2026-08". */
export const currentPeriod = (d = new Date()) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

/**
 * Records one content-API hit and returns the running count for this month.
 * Atomic upsert-and-increment so it is safe under concurrency.
 */
export async function bumpApiCall(projectId: unknown, period = currentPeriod()): Promise<number> {
  const doc = await Usage.findOneAndUpdate(
    { projectId, period },
    { $inc: { apiCalls: 1 } },
    { upsert: true, new: true }
  );
  return doc.apiCalls;
}

/** Read-only: this month's count without incrementing (for the usage display). */
export async function apiCallsThisMonth(projectId: unknown, period = currentPeriod()): Promise<number> {
  const doc = await Usage.findOne({ projectId, period });
  return doc?.apiCalls ?? 0;
}

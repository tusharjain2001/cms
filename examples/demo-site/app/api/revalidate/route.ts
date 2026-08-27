import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { checkRevalidateRequest } from "@pagecraft/sdk";

/**
 * The webhook the CMS calls when a client presses Publish.
 *
 * This is the entire "the site updates itself" mechanism — about fifteen lines
 * on the website's side.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const result = checkRevalidateRequest(body, process.env.PAGECRAFT_REVALIDATE_SECRET ?? "");

  if (!result.ok) {
    return NextResponse.json({ revalidated: false, error: result.error }, { status: result.status });
  }

  for (const path of result.paths) revalidatePath(path);
  // The navigation lives in the layout, so refresh it too.
  revalidatePath("/", "layout");

  return NextResponse.json({ revalidated: true, paths: result.paths });
}

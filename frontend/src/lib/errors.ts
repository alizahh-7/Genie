export class ApiError extends Error {
  constructor(public status: number, public friendly: string, public code?: string) { super(friendly); }
}
/** Endpoint-specific wording for a 404. A 404 only means "expired" for the person record itself. */
export interface NotFoundOverride { message: string; code?: string }
export const PERSON_EXPIRED_CODE = "person-expired";
export const PERSON_EXPIRED_MESSAGE = "This page has expired or was deleted.";
export const COMPARE_NOT_GENERATED = "No comparison has been generated yet.";
export const WISH_BOOK_NOT_COMPILED = "The Wish Book hasn't been compiled yet.";
export function friendlyMessage(status: number, detail?: unknown): string {
  const d = typeof detail === "string" && detail ? detail : "";
  if (status === 0) return "We could not reach Genie. Please check your connection and try again.";
  if (status === 404) return "We couldn't find that. It may not exist yet, or it may have been removed.";
  if (status === 409 && d) return d;
  if (status === 422) return "Please check what you entered and try again.";
  if (status === 429) return "Too many requests. Please slow down and try again shortly.";
  if (status === 502) return "Something went wrong while gathering their story. Please try again.";
  if (status === 503) return d || "Genie's agent is not available on this server";
  if (status === 504) return "This is taking longer than expected. Please try again in a moment.";
  return d || "Something went wrong. Please try again.";
}

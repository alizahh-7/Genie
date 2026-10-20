export class ApiError extends Error {
  constructor(public status: number, public friendly: string) { super(friendly); }
}
export function friendlyMessage(status: number, detail?: unknown): string {
  const d = typeof detail === "string" && detail ? detail : "";
  if (status === 0) return "We could not reach Genie. Please check your connection and try again.";
  if (status === 404) return "This page has expired or was deleted.";
  if (status === 409 && d) return d;
  if (status === 422) return "Please check what you entered and try again.";
  if (status === 429) return "Too many requests. Please slow down and try again shortly.";
  if (status === 502) return "Something went wrong while gathering their story. Please try again.";
  if (status === 503) return d || "Genie's agent is not available on this server";
  if (status === 504) return "This is taking longer than expected. Please try again in a moment.";
  return d || "Something went wrong. Please try again.";
}

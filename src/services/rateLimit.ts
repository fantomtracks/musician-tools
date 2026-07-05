// Thrown by the fetch layer when a rate-limited auth endpoint replies 429 (the
// shared limiters of story 7.4). Detected by response.status — NEVER by the body
// message — and it carries a single canonical, detail-free copy: no Retry-After,
// window, countdown, or attempt count is ever exposed (anti-oracle, NFR-S1). Pages
// test `err instanceof RateLimitError` to render it distinctly (amber, not the red
// of a credential/field error). Mirrors PlaylistConflictError / TopicConflictError.
export class RateLimitError extends Error {
  constructor() {
    super('Too many attempts. Please try again in a few minutes.');
    this.name = 'RateLimitError';
  }
}

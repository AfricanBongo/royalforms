/**
 * Shared validation utilities.
 *
 * Keep validators as pure functions that return a boolean or an error
 * message string so they can be used in form handlers and bulk pipelines.
 */

// ---------------------------------------------------------------------------
// Email
// ---------------------------------------------------------------------------

/**
 * Lightweight email format check.
 *
 * Matches the vast majority of real-world addresses without being overly
 * strict (the only truly correct check is sending a verification email).
 * Pattern: local@domain.tld — local allows dots and common special chars,
 * domain requires at least one dot with a 2+ char TLD.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * Returns `true` when the value looks like a valid email address.
 */
export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim())
}

/**
 * Browser-scoped preference keys.
 *
 * These are deliberately client-side only: the schema stores no preferences, and
 * inventing a server-side settings table would imply persistence the product does not
 * have. Keys are namespaced to avoid collisions with other apps on the same origin.
 */

export const MASK_PII_PREFERENCE_KEY = 'resume-analyzer:mask-pii-default';

/** Safe read: never throws when storage is blocked (Safari private mode, etc.). */
export function readBooleanPreference(key: string, fallback = false): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const value = window.localStorage.getItem(key);
    if (value === null) return fallback;
    return value === 'true';
  } catch {
    return fallback;
  }
}

export function writeBooleanPreference(key: string, value: boolean): boolean {
  if (typeof window === 'undefined') return false;
  try {
    window.localStorage.setItem(key, value ? 'true' : 'false');
    return true;
  } catch {
    return false;
  }
}

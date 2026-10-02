/**
 * Masking helpers for anything that leaves the trust boundary towards a human
 * reader (admin console) or a third party (LLM prompts).
 */

/**
 * Mask an email for admin display: `john.doe@gmail.com` -> `jo***@gmail.com`.
 * Never returns the local part beyond two characters, and rejects malformed input.
 */
export function maskEmail(email: string | null | undefined): string {
  if (!email) return '—';
  const trimmed = email.trim();
  const atIndex = trimmed.lastIndexOf('@');
  if (atIndex <= 0) return '***';

  const local = trimmed.slice(0, atIndex);
  const domain = trimmed.slice(atIndex + 1);
  if (!domain) return '***';

  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}***@${domain}`;
}

/** `+1 (415) 555-0100` -> `+1 (4••) •••-••00` (last two digits kept for support). */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '•••';
  const visibleTail = digits.slice(-2);
  return `•••-••${visibleTail}`;
}

/** Redact everything except the final four characters (keys, ids, tokens). */
export function maskSecret(secret: string | null | undefined, visible = 4): string {
  if (!secret) return '—';
  if (secret.length <= visible) return '•'.repeat(secret.length);
  return `${'•'.repeat(Math.min(8, secret.length - visible))}${secret.slice(-visible)}`;
}

/** Mask a UUID-ish identifier for logs: keeps the first and last group. */
export function maskId(id: string | null | undefined): string {
  if (!id) return '—';
  if (id.length < 12) return '•••';
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/** Mask an IP address (`203.0.113.42` -> `203.0.113.••`). */
export function maskIp(ip: string | null | undefined): string {
  if (!ip) return '—';
  if (ip.includes(':')) {
    const groups = ip.split(':');
    return `${groups.slice(0, 3).join(':')}:••••`;
  }
  const parts = ip.split('.');
  if (parts.length !== 4) return '•••';
  return `${parts.slice(0, 3).join('.')}.••`;
}

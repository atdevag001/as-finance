/**
 * Decode the payload of a JWT into a parsed JSON object.
 *
 * Handles URL-safe base64 (replaces - and _), pads missing = chars,
 * and decodes UTF-8 correctly so non-ASCII payload values (e.g. an
 * Indian-script full_name) round-trip without corruption.
 */
export function decodeJwtPayload(token: string): unknown {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Invalid JWT: missing payload segment');
  }
  let b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  if (pad) b64 += '='.repeat(4 - pad);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const json = new TextDecoder('utf-8').decode(bytes);
  return JSON.parse(json);
}

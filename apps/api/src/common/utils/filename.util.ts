import path from 'path';

/**
 * Sanitize a filename for use in Content-Disposition headers.
 * Returns ASCII fallback + RFC 5987 percent-encoded UTF-8.
 */
export function sanitizeFilenameForHeader(rawFilename: string): {
  asciiSafe: string;
  utf8Encoded: string;
} {
  const base = path.basename(rawFilename || 'file');
  const asciiSafe = base.replace(/[^\w.\-]/g, '_').slice(0, 100) || 'file';
  const utf8Encoded = encodeURIComponent(base).slice(0, 200);
  return { asciiSafe, utf8Encoded };
}

/**
 * Build a safe RFC 5987 Content-Disposition header value.
 *
 *   buildContentDisposition('inline', 'मेरा फाइल.pdf')
 *   → inline; filename="file.pdf"; filename*=UTF-8''%E0%A4%AE...
 */
export function buildContentDisposition(
  disposition: 'inline' | 'attachment',
  rawFilename: string,
): string {
  const { asciiSafe, utf8Encoded } = sanitizeFilenameForHeader(rawFilename);
  return `${disposition}; filename="${asciiSafe}"; filename*=UTF-8''${utf8Encoded}`;
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@as-finance/shared'],
  async headers() {
    /**
     * Security headers applied to every web response.
     *
     * The NestJS API already sets these via helmet on /api/* responses, but the
     * Next.js front-end serves /login, /, and the dashboard shell directly —
     * those need their own header pass to satisfy verify-prod and any security
     * scanner.
     *
     * HSTS:                lock browsers onto HTTPS for a year, including subdomains.
     * X-Frame-Options:     deny clickjacking — no embedding in any iframe.
     * X-Content-Type-Options: stop MIME sniffing that can turn a JPEG into a script.
     * Referrer-Policy:     never leak the URL we're on to third parties.
     * Permissions-Policy:  disable browser APIs we don't use.
     */
    const securityHeaders = [
      {
        key: 'Strict-Transport-Security',
        value: 'max-age=31536000; includeSubDomains',
      },
      { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), payment=()',
      },
      { key: 'X-DNS-Prefetch-Control', value: 'on' },
    ];

    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;

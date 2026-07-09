const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https: wss: ws:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "form-action 'self'",
].join("; ");

const BASE_SECURITY_HEADERS = [
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

export const SECURITY_HEADER_RULE = {
  source: "/((?!onboarding/espn/mock-browser).*)",
  headers: [
    ...BASE_SECURITY_HEADERS,
    {
      key: "Content-Security-Policy",
      value: CONTENT_SECURITY_POLICY,
    },
    {
      key: "X-Frame-Options",
      value: "DENY",
    },
  ],
};

export const MOCK_BROWSER_SECURITY_HEADER_RULE = {
  source: "/onboarding/espn/mock-browser",
  headers: BASE_SECURITY_HEADERS,
};

export { CONTENT_SECURITY_POLICY };

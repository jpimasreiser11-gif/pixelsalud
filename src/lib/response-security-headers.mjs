export const requiredResponseHeaders = [
  ["Strict-Transport-Security", (value) => /max-age=31536000/i.test(value) && /includeSubDomains/i.test(value)],
  ["Content-Security-Policy", (value) => [
    /(?:^|;)\s*default-src\s+'self'(?:\s|;|$)/i,
    /(?:^|;)\s*object-src\s+'none'(?:\s|;|$)/i,
    /(?:^|;)\s*frame-ancestors\s+'none'(?:\s|;|$)/i,
  ].every((pattern) => pattern.test(value))],
  ["X-Content-Type-Options", (value) => /^nosniff$/i.test(value.trim())],
  ["X-Frame-Options", (value) => /^DENY$/i.test(value.trim())],
  ["Referrer-Policy", (value) => /^strict-origin-when-cross-origin$/i.test(value.trim())],
  ["Permissions-Policy", (value) => ["camera=()", "microphone=()", "geolocation=()"]
    .every((directive) => value.toLowerCase().includes(directive))],
  ["Cross-Origin-Opener-Policy", (value) => /^same-origin$/i.test(value.trim())],
];

export function missingResponseSecurityHeaders(headers) {
  return requiredResponseHeaders
    .filter(([name, accepts]) => {
      const value = headers.get(name);
      return !value || !accepts(value);
    })
    .map(([name]) => name);
}

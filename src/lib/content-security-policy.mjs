import { launchReady } from './launch-config.mjs';

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

// No third-party scripts/frames during prelaunch. The reviewed launch switch
// must cover the anti-abuse provider as well as the site's legal information.
export function siteCspDirectives(turnstileEnabled = launchReady) {
  return ["default-src 'self'", "base-uri 'self'", "object-src 'none'",
    "form-action 'self' mailto:", "img-src 'self' data:", "font-src 'self'", "connect-src 'self'",
    ...(turnstileEnabled ? [`frame-src ${TURNSTILE_ORIGIN}`, `script-src 'self' ${TURNSTILE_ORIGIN}`] : [])];
}
export function siteCspHeader(turnstileEnabled = launchReady) {
  return [...siteCspDirectives(turnstileEnabled), "frame-ancestors 'none'", "style-src 'self'",
    ...(turnstileEnabled ? [] : ["script-src 'self'"])].join('; ');
}

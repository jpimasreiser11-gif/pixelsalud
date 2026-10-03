-- Store only a short-lived keyed digest of the Cloudflare client-IP/time bucket.
CREATE TABLE google_login_start_rate_limits (
  bucket_hash TEXT PRIMARY KEY NOT NULL
    CHECK (length(bucket_hash) = 64 AND bucket_hash NOT GLOB '*[^a-f0-9]*'),
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 5),
  expires_at INTEGER NOT NULL
);

CREATE INDEX google_login_start_rate_limits_expiry
  ON google_login_start_rate_limits(expires_at);

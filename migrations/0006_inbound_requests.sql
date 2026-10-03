-- A short-lived delivery buffer, NOT the CRM. Sheets remains the source of truth.
CREATE TABLE inbound_requests (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  submission_id TEXT NOT NULL CHECK(length(submission_id) = 64 AND submission_id NOT GLOB '*[^a-f0-9]*'),
  request_hash TEXT NOT NULL CHECK(length(request_hash) = 64 AND request_hash NOT GLOB '*[^a-f0-9]*'),
  payload_json TEXT CHECK(payload_json IS NULL OR (json_valid(payload_json) AND length(payload_json) <= 8000)),
  service TEXT NOT NULL CHECK(service IN ('automation-sprint', 'growth-system', 'private-ai', 'otro')),
  notice_version TEXT NOT NULL,
  marketing_consent INTEGER NOT NULL CHECK(marketing_consent IN (0,1)),
  marketing_source TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  payload_expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'claimed', 'crm_confirmed', 'manual_review', 'expired')),
  lease_hash TEXT CHECK(lease_hash IS NULL OR (length(lease_hash) = 64 AND lease_hash NOT GLOB '*[^a-f0-9]*')),
  lease_expires_at INTEGER,
  result_hash TEXT CHECK(result_hash IS NULL OR (length(result_hash) = 64 AND result_hash NOT GLOB '*[^a-f0-9]*')),
  error_code TEXT CHECK(error_code IS NULL OR error_code IN ('crm_unconfirmed','invalid_response','lease_expired','payload_expired')),
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id, submission_id),
  CHECK(status NOT IN ('pending','claimed') OR payload_json IS NOT NULL),
  CHECK(status != 'claimed' OR (lease_hash IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK((marketing_consent = 0 AND marketing_source = '') OR (marketing_consent = 1 AND marketing_source = 'contacto-marketing-checkbox-v1'))
);
CREATE INDEX inbound_dispatch ON inbound_requests(workspace_id,status,received_at);
-- Serialize this dispatch channel: Sheets append has no transactional unique key.
CREATE UNIQUE INDEX inbound_one_inflight ON inbound_requests(workspace_id) WHERE status = 'claimed';
CREATE TABLE inbound_rate_limits (
  bucket_hash TEXT PRIMARY KEY NOT NULL CHECK(length(bucket_hash) = 64),
  request_count INTEGER NOT NULL CHECK(request_count > 0),
  expires_at INTEGER NOT NULL
);

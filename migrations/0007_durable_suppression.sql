-- Operational opposition ledger, not a CRM or proof of marketing permission.
-- Emails are application-encrypted only while an unused link / CRM sync needs them.
CREATE TABLE unsubscribe_tokens (
  token_hash TEXT PRIMARY KEY NOT NULL CHECK(length(token_hash)=64 AND token_hash NOT GLOB '*[^a-f0-9]*'),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  recipient_key TEXT NOT NULL CHECK(length(recipient_key)=64 AND recipient_key NOT GLOB '*[^a-f0-9]*'),
  encrypted_email TEXT CHECK(encrypted_email IS NULL OR length(encrypted_email) BETWEEN 40 AND 500),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  confirmed_at INTEGER,
  CHECK(confirmed_at IS NOT NULL OR encrypted_email IS NOT NULL)
);
CREATE INDEX unsubscribe_token_retention ON unsubscribe_tokens(workspace_id,expires_at);
CREATE INDEX unsubscribe_token_issuance ON unsubscribe_tokens(workspace_id,issued_at);
CREATE TABLE mail_suppressions (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  recipient_key TEXT NOT NULL CHECK(length(recipient_key)=64 AND recipient_key NOT GLOB '*[^a-f0-9]*'),
  event_id TEXT NOT NULL UNIQUE CHECK(length(event_id)=64 AND event_id NOT GLOB '*[^a-f0-9]*'),
  requested_at INTEGER NOT NULL,
  PRIMARY KEY(workspace_id,recipient_key)
);
CREATE TABLE suppression_outbox (
  event_id TEXT PRIMARY KEY NOT NULL REFERENCES mail_suppressions(event_id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL,
  recipient_key TEXT NOT NULL,
  encrypted_email TEXT CHECK(encrypted_email IS NULL OR length(encrypted_email) BETWEEN 40 AND 500),
  payload_expires_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','claimed','synced','manual_review','expired')),
  lease_hash TEXT CHECK(lease_hash IS NULL OR (length(lease_hash)=64 AND lease_hash NOT GLOB '*[^a-f0-9]*')),
  lease_expires_at INTEGER,
  result_hash TEXT CHECK(result_hash IS NULL OR (length(result_hash)=64 AND result_hash NOT GLOB '*[^a-f0-9]*')),
  error_code TEXT CHECK(error_code IS NULL OR error_code IN ('crm_unconfirmed','invalid_response','lease_expired','payload_expired')),
  updated_at INTEGER NOT NULL,
  UNIQUE(workspace_id,recipient_key),
  FOREIGN KEY(workspace_id,recipient_key) REFERENCES mail_suppressions(workspace_id,recipient_key) ON DELETE RESTRICT,
  CHECK(status NOT IN ('pending','claimed') OR encrypted_email IS NOT NULL),
  CHECK(status!='claimed' OR (lease_hash IS NOT NULL AND lease_expires_at IS NOT NULL))
);
CREATE INDEX suppression_dispatch ON suppression_outbox(workspace_id,status,updated_at);
CREATE UNIQUE INDEX suppression_one_inflight ON suppression_outbox(workspace_id) WHERE status='claimed';

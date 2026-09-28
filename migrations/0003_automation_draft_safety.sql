-- Idempotent draft creation and bounded per-user write volume.
ALTER TABLE automations ADD COLUMN idempotency_key_hash TEXT
  CHECK (idempotency_key_hash IS NULL OR (length(idempotency_key_hash) = 64 AND idempotency_key_hash NOT GLOB '*[^a-f0-9]*'));
ALTER TABLE automations ADD COLUMN request_hash TEXT
  CHECK (request_hash IS NULL OR (length(request_hash) = 64 AND request_hash NOT GLOB '*[^a-f0-9]*'));

CREATE UNIQUE INDEX automations_workspace_idempotency
  ON automations(workspace_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE TABLE api_rate_limits (
  user_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action = 'automation.draft.create'),
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count BETWEEN 1 AND 15),
  PRIMARY KEY (user_id, action),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

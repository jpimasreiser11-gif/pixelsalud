-- Agency-internal document drafting only: not a customer execution engine.
CREATE TABLE document_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  brief TEXT NOT NULL CHECK (length(brief) BETWEEN 20 AND 4000),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'claimed', 'completed', 'manual_review')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  not_before INTEGER NOT NULL,
  lease_hash TEXT CHECK (lease_hash IS NULL OR (length(lease_hash) = 64 AND lease_hash NOT GLOB '*[^a-f0-9]*')),
  lease_expires_at INTEGER,
  result_json TEXT CHECK (result_json IS NULL OR (json_valid(result_json) AND length(result_json) <= 80000)),
  result_hash TEXT CHECK (result_hash IS NULL OR (length(result_hash) = 64 AND result_hash NOT GLOB '*[^a-f0-9]*')),
  error_code TEXT CHECK (error_code IS NULL OR error_code IN ('local_unavailable', 'invalid_output', 'worker_failed', 'lease_expired')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (workspace_id, version_id),
  FOREIGN KEY (workspace_id, automation_id, version_id)
    REFERENCES automation_versions(workspace_id, automation_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, requested_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
  CHECK (status != 'claimed' OR (lease_hash IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status != 'completed' OR (result_json IS NOT NULL AND result_hash IS NOT NULL))
);
CREATE INDEX document_jobs_dispatch ON document_jobs(workspace_id, status, not_before, created_at);

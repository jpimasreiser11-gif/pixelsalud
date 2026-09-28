-- VARINO Autopilot core model. Applied only to local D1 in this phase.
-- Tenant ownership is part of every foreign key that crosses a workspace.

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE
    CHECK (length(email) BETWEEN 3 AND 320),
  email_verified_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'disabled')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  slug TEXT NOT NULL UNIQUE
    CHECK (
      length(slug) BETWEEN 1 AND 64
      AND slug NOT GLOB '*[^a-z0-9-]*'
      AND slug NOT LIKE '-%'
      AND slug NOT LIKE '%-'
    ),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('invited', 'active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE
    CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^a-f0-9]*'),
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > issued_at),
  revoked_at INTEGER,
  last_seen_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE TABLE automations (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 80),
  objective TEXT NOT NULL CHECK (length(trim(objective)) BETWEEN 8 AND 400),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'error')),
  autonomy TEXT NOT NULL DEFAULT 'safe'
    CHECK (autonomy IN ('safe', 'assisted')),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  UNIQUE (workspace_id, id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE automation_versions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  plan_json TEXT NOT NULL CHECK (json_valid(plan_json)),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
  approval_required INTEGER NOT NULL CHECK (approval_required IN (0, 1)),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (workspace_id, automation_id, version_number),
  UNIQUE (workspace_id, automation_id, id),
  FOREIGN KEY (workspace_id, automation_id)
    REFERENCES automations(workspace_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE approvals (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  requested_by_user_id TEXT NOT NULL,
  resolved_by_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  action_summary TEXT NOT NULL CHECK (length(trim(action_summary)) BETWEEN 1 AND 500),
  created_at INTEGER NOT NULL,
  resolved_at INTEGER,
  CHECK (
    (status = 'pending' AND resolved_at IS NULL AND resolved_by_user_id IS NULL)
    OR (status = 'cancelled' AND resolved_at IS NOT NULL)
    OR (status IN ('approved', 'rejected')
      AND resolved_at IS NOT NULL
      AND resolved_by_user_id IS NOT NULL)
  ),
  FOREIGN KEY (workspace_id, automation_id, version_id)
    REFERENCES automation_versions(workspace_id, automation_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, requested_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, resolved_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE TABLE workflow_runs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  automation_id TEXT NOT NULL,
  version_id TEXT NOT NULL,
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('manual', 'schedule', 'email_received')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'waiting_approval', 'succeeded', 'failed', 'cancelled')),
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 160),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0 AND attempt_count <= 10),
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  ended_at INTEGER,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) <= 80),
  UNIQUE (workspace_id, idempotency_key),
  FOREIGN KEY (workspace_id, automation_id, version_id)
    REFERENCES automation_versions(workspace_id, automation_id, id) ON DELETE RESTRICT
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 80),
  resource_type TEXT NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 80),
  resource_id TEXT NOT NULL CHECK (length(resource_id) <= 160),
  metadata_json TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata_json)),
  created_at INTEGER NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
  FOREIGN KEY (workspace_id, actor_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT
);

CREATE INDEX workspace_members_user_status
  ON workspace_members(user_id, status);
CREATE INDEX sessions_user_expiry
  ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;
CREATE INDEX automations_workspace_status
  ON automations(workspace_id, status, updated_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX automation_versions_workspace_created
  ON automation_versions(workspace_id, automation_id, created_at DESC);
CREATE INDEX approvals_workspace_status
  ON approvals(workspace_id, status, created_at DESC);
CREATE INDEX workflow_runs_workspace_status
  ON workflow_runs(workspace_id, status, created_at DESC);
CREATE INDEX audit_events_workspace_created
  ON audit_events(workspace_id, created_at DESC);

CREATE TRIGGER workspace_keep_active_owner_on_delete
BEFORE DELETE ON workspace_members
WHEN OLD.role = 'OWNER'
  AND OLD.status = 'active'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND user_id != OLD.user_id
      AND role = 'OWNER'
      AND status = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'workspace must retain an active owner');
END;

CREATE TRIGGER workspace_keep_active_owner_on_update
BEFORE UPDATE OF workspace_id, role, status ON workspace_members
WHEN OLD.role = 'OWNER'
  AND OLD.status = 'active'
  AND (
    NEW.workspace_id != OLD.workspace_id
    OR NEW.role != 'OWNER'
    OR NEW.status != 'active'
  )
  AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = OLD.workspace_id
      AND user_id != OLD.user_id
      AND role = 'OWNER'
      AND status = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'workspace must retain an active owner');
END;

CREATE TRIGGER audit_events_are_append_only_on_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

CREATE TRIGGER audit_events_are_append_only_on_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit events are append-only');
END;

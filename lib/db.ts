import fs from 'fs';
import path from 'path';
import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import { Pool } from 'pg';

// Database Interface Schema
export interface User {
  id: string;
  uid: string;
  name: string;
  created_at: string;
}

export interface Project {
  id: string;
  user_id: string;
  name: string;
  description: string;
  files: Record<string, string>; // filename -> content
  active_branch?: string;
  live_url?: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  project_id: string;
  user_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  reasoning?: string;
  action_taken?: string;
  step_details?: Array<{ step: string; status: 'pending' | 'in_progress' | 'completed' | 'failed'; detail?: string }>;
  created_at: string;
}

export interface UserSettings {
  user_id: string;
  github_token: string;
  github_owner: string;
  github_repo: string;
  vercel_token: string;
  vercel_team_id: string;
  vercel_project_id: string;
  firebase_db_url: string;
  firebase_secret: string;
  anthropic_api_key?: string;
  preferred_model?: string;
  updated_at: string;
}

export interface Spec {
  id: string;
  project_id: string;
  user_id: string;
  raw_requirement: string;
  structured_spec: string; // JSON string: { goals, pages, features, constraints, acceptance_criteria }
  status: 'draft' | 'approved' | 'building' | 'done';
  created_at: string;
  updated_at: string;
}

export interface ProjectMember {
  id: string;
  project_id: string;
  user_id: string;
  role: 'owner' | 'editor' | 'viewer';
  invited_by: string;
  created_at: string;
}

export interface PullRequestRecord {
  id: string;
  project_id: string;
  user_id: string;
  branch_name: string;
  pr_url: string;
  pr_number: number;
  title: string;
  review_summary: string;
  status: 'open' | 'merged' | 'closed';
  created_at: string;
}

export interface VectorEmbedding {
  id: string;
  project_id: string;
  user_id: string;
  doc_type: string;
  title: string;
  content: string;
  embedding: number[];
  created_at: string;
}

export interface Lesson {
  id: string;
  project_id?: string | null;
  user_id: string;
  lesson_type: 'validation_error' | 'user_correction' | 'style_preference' | 'deployment_failure' | 'repeated_failure';
  trigger_summary: string;
  fix_or_rule: string;
  occurrence_count: number;
  embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface BrandProfile {
  project_id: string;
  primary_color: string;
  secondary_color?: string | null;
  accent_color?: string | null;
  font_family?: string | null;
  tone?: string | null;
  logo_description?: string | null;
  additional_notes?: string | null;
  updated_at: string;
}

export interface FormSubmission {
  id: string;
  project_id: string;
  form_name: string;
  submitted_data: Record<string, any>;
  submitted_at: string;
}

export interface TaskPlanItem {
  id: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'skipped';
  result_summary?: string;
  retry_count: number;
}

export interface TaskPlan {
  id: string;
  project_id: string;
  user_id: string;
  original_prompt: string;
  tasks: TaskPlanItem[];
  overall_status: 'pending' | 'pending_approval' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

// In-Memory & File Persistent SQLite/JSON Database Fallback
const DB_FILE_PATH = process.env.DB_FILE_PATH || '/tmp/website_builder_db.sqlite';
const JSON_BACKUP_PATH = process.env.JSON_BACKUP_PATH || '/tmp/website_builder_store.json';

let sqliteDb: SqlJsDatabase | null = null;
let pgPool: Pool | null = null;
let isPgAvailable = false;

// Initialize Database Connection
async function getDbInstance(): Promise<SqlJsDatabase> {
  if (sqliteDb) return sqliteDb;

  const SQL = await initSqlJs();
  let fileBuffer: Buffer | null = null;

  if (fs.existsSync(DB_FILE_PATH)) {
    try {
      fileBuffer = fs.readFileSync(DB_FILE_PATH);
    } catch (err) {
      console.warn('Could not read SQLite file from disk, initializing fresh:', err);
    }
  }

  sqliteDb = fileBuffer ? new SQL.Database(fileBuffer) : new SQL.Database();
  initializeSqliteSchema(sqliteDb);
  return sqliteDb;
}

function saveDbToDisk() {
  if (!sqliteDb) return;
  try {
    const data = sqliteDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE_PATH, buffer);
  } catch (err) {
    console.warn('Unable to persist SQLite DB to filesystem (likely read-only environment):', err);
  }
}

// Check for Postgres
if (process.env.DATABASE_URL || process.env.POSTGRES_URL) {
  try {
    pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
    isPgAvailable = true;
  } catch (err) {
    console.warn('Postgres connection failed, falling back to SQLite:', err);
    isPgAvailable = false;
  }
}

// ---- Postgres schema (created lazily on first real query) ----
const PG_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    uid TEXT UNIQUE,
    name TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    name TEXT,
    description TEXT,
    files TEXT,
    active_branch TEXT,
    live_url TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    role TEXT,
    content TEXT,
    reasoning TEXT,
    action_taken TEXT,
    step_details TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    github_token TEXT,
    github_owner TEXT,
    github_repo TEXT,
    vercel_token TEXT,
    vercel_team_id TEXT,
    vercel_project_id TEXT,
    firebase_db_url TEXT,
    firebase_secret TEXT,
    anthropic_api_key TEXT,
    preferred_model TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS vector_embeddings (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    doc_type TEXT,
    title TEXT,
    content TEXT,
    embedding TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS lessons (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    lesson_type TEXT,
    trigger_summary TEXT,
    fix_or_rule TEXT,
    occurrence_count INTEGER,
    embedding TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS brand_profiles (
    project_id TEXT PRIMARY KEY,
    primary_color TEXT,
    secondary_color TEXT,
    accent_color TEXT,
    font_family TEXT,
    tone TEXT,
    logo_description TEXT,
    additional_notes TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS form_submissions (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    form_name TEXT,
    submitted_data TEXT,
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS task_plans (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    original_prompt TEXT,
    tasks TEXT,
    overall_status TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS specs (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    raw_requirement TEXT,
    structured_spec TEXT,
    status TEXT,
    created_at TEXT,
    updated_at TEXT
  );

  CREATE TABLE IF NOT EXISTS project_members (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    role TEXT,
    invited_by TEXT,
    created_at TEXT
  );

  CREATE TABLE IF NOT EXISTS pull_requests (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    user_id TEXT,
    branch_name TEXT,
    pr_url TEXT,
    pr_number INTEGER,
    title TEXT,
    review_summary TEXT,
    status TEXT,
    created_at TEXT
  );
`;

let pgSchemaReadyPromise: Promise<void> | null = null;

// Ensures all required tables exist in Postgres before any query runs.
// Runs exactly once per server instance (cached promise), so every
// exported function that touches pgPool awaits this first.
function ensurePgSchemaReady(): Promise<void> {
  if (!pgPool) return Promise.resolve();
  if (!pgSchemaReadyPromise) {
    pgSchemaReadyPromise = pgPool
      .query(PG_SCHEMA_SQL)
      .then(() => {
        console.log('[db] Postgres schema verified/created successfully.');
      })
      .catch((err) => {
        console.error('[db] FAILED to create Postgres schema. Check DATABASE_URL permissions:', err);
        // Reset so a future call can retry instead of permanently caching a failure.
        pgSchemaReadyPromise = null;
        throw err;
      });
  }
  return pgSchemaReadyPromise;
}


function initializeSqliteSchema(db: SqlJsDatabase) {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      uid TEXT UNIQUE,
      name TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      description TEXT,
      files TEXT,
      active_branch TEXT,
      live_url TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      role TEXT,
      content TEXT,
      reasoning TEXT,
      action_taken TEXT,
      step_details TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id TEXT PRIMARY KEY,
      github_token TEXT,
      github_owner TEXT,
      github_repo TEXT,
      vercel_token TEXT,
      vercel_team_id TEXT,
      vercel_project_id TEXT,
      firebase_db_url TEXT,
      firebase_secret TEXT,
      anthropic_api_key TEXT,
      preferred_model TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS vector_embeddings (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      doc_type TEXT,
      title TEXT,
      content TEXT,
      embedding TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      lesson_type TEXT,
      trigger_summary TEXT,
      fix_or_rule TEXT,
      occurrence_count INTEGER,
      embedding TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS brand_profiles (
      project_id TEXT PRIMARY KEY,
      primary_color TEXT,
      secondary_color TEXT,
      accent_color TEXT,
      font_family TEXT,
      tone TEXT,
      logo_description TEXT,
      additional_notes TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS form_submissions (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      form_name TEXT,
      submitted_data TEXT,
      submitted_at TEXT
    );

    CREATE TABLE IF NOT EXISTS task_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      original_prompt TEXT,
      tasks TEXT,
      overall_status TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS specs (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      raw_requirement TEXT,
      structured_spec TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS project_members (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      role TEXT,
      invited_by TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS pull_requests (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      user_id TEXT,
      branch_name TEXT,
      pr_url TEXT,
      pr_number INTEGER,
      title TEXT,
      review_summary TEXT,
      status TEXT,
      created_at TEXT
    );
  `);
  saveDbToDisk();
}

// Seed or Get User
// Checks whether a user row already exists for this uid, WITHOUT creating
// one. Used to distinguish "brand new user, never had a project" from
// "returning user who deleted their last project" — the two cases that
// both look like "projects.length === 0" but should NOT both trigger
// auto-creating a starter project (the latter would make deletion look
// broken: the user deletes their only project, and a fresh default one
// silently reappears on the next page load).
export async function checkUserExists(uid: string): Promise<boolean> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT id FROM users WHERE uid = $1', [uid]);
    return res.rows.length > 0;
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT id FROM users WHERE uid = :uid');
    stmt.bind({ ':uid': uid });
    const exists = stmt.step();
    stmt.free();
    return exists;
  }
}

export async function getOrCreateUser(uid: string, name = 'User'): Promise<User> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM users WHERE uid = $1', [uid]);
    if (res.rows.length > 0) return res.rows[0];

    const newUser: User = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uid,
      name,
      created_at: new Date().toISOString(),
    };
    await pgPool.query(
      'INSERT INTO users (id, uid, name, created_at) VALUES ($1, $2, $3, $4)',
      [newUser.id, newUser.uid, newUser.name, newUser.created_at]
    );
    return newUser;
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM users WHERE uid = :uid');
    stmt.bind({ ':uid': uid });
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row as unknown as User;
    }
    stmt.free();

    const newUser: User = {
      id: `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      uid,
      name,
      created_at: new Date().toISOString(),
    };

    db.run(
      'INSERT INTO users (id, uid, name, created_at) VALUES (?, ?, ?, ?)',
      [newUser.id, newUser.uid, newUser.name, newUser.created_at]
    );
    saveDbToDisk();
    return newUser;
  }
}

// Projects Operations (Strict User Isolation)
export async function getProjects(userId: string): Promise<Project[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query(
      'SELECT * FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );
    return res.rows.map((row) => ({
      ...row,
      files: typeof row.files === 'string' ? JSON.parse(row.files) : row.files || {},
    }));
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM projects WHERE user_id = :userId ORDER BY updated_at DESC');
    stmt.bind({ ':userId': userId });
    const projects: Project[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      projects.push({
        id: String(row.id),
        user_id: String(row.user_id),
        name: String(row.name),
        description: String(row.description || ''),
        files: row.files ? JSON.parse(String(row.files)) : {},
        active_branch: String(row.active_branch || 'main'),
        live_url: String(row.live_url || ''),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      });
    }
    stmt.free();
    return projects;
  }
}

export async function getProject(projectId: string, userId: string): Promise<Project | null> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query(
      'SELECT * FROM projects WHERE id = $1 AND user_id = $2',
      [projectId, userId]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      ...row,
      files: typeof row.files === 'string' ? JSON.parse(row.files) : row.files || {},
    };
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM projects WHERE id = :projectId AND user_id = :userId');
    stmt.bind({ ':projectId': projectId, ':userId': userId });
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      stmt.free();
      return {
        id: String(row.id),
        user_id: String(row.user_id),
        name: String(row.name),
        description: String(row.description || ''),
        files: row.files ? JSON.parse(String(row.files)) : {},
        active_branch: String(row.active_branch || 'main'),
        live_url: String(row.live_url || ''),
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    }
    stmt.free();
    return null;
  }
}

export async function createProject(
  userId: string,
  name: string,
  description = '',
  initialFiles: Record<string, string> = {}
): Promise<Project> {
  const newProject: Project = {
    id: `proj_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    user_id: userId,
    name,
    description,
    files: initialFiles,
    active_branch: 'main',
    live_url: '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO projects (id, user_id, name, description, files, active_branch, live_url, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        newProject.id,
        newProject.user_id,
        newProject.name,
        newProject.description,
        JSON.stringify(newProject.files),
        newProject.active_branch || 'main',
        newProject.live_url || '',
        newProject.created_at,
        newProject.updated_at,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO projects (id, user_id, name, description, files, active_branch, live_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newProject.id,
        newProject.user_id,
        newProject.name,
        newProject.description,
        JSON.stringify(newProject.files),
        newProject.active_branch || 'main',
        newProject.live_url || '',
        newProject.created_at,
        newProject.updated_at,
      ]
    );
    saveDbToDisk();
  }
  return newProject;
}

export async function updateProject(
  projectId: string,
  userId: string,
  updates: Partial<Omit<Project, 'id' | 'user_id' | 'created_at'>>
): Promise<Project | null> {
  const existing = await getProject(projectId, userId);
  if (!existing) return null;

  const updated: Project = {
    ...existing,
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `UPDATE projects SET name = $1, description = $2, files = $3, active_branch = $4, live_url = $5, updated_at = $6
       WHERE id = $7 AND user_id = $8`,
      [
        updated.name,
        updated.description,
        JSON.stringify(updated.files),
        updated.active_branch || 'main',
        updated.live_url || '',
        updated.updated_at,
        projectId,
        userId,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `UPDATE projects SET name = ?, description = ?, files = ?, active_branch = ?, live_url = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
      [
        updated.name,
        updated.description,
        JSON.stringify(updated.files),
        updated.active_branch || 'main',
        updated.live_url || '',
        updated.updated_at,
        projectId,
        userId,
      ]
    );
    saveDbToDisk();
  }
  return updated;
}

export async function deleteProject(projectId: string, userId: string): Promise<boolean> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query('DELETE FROM messages WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    await pgPool.query('DELETE FROM vector_embeddings WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    await pgPool.query('DELETE FROM lessons WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    await pgPool.query('DELETE FROM brand_profiles WHERE project_id = $1', [projectId]);
    await pgPool.query('DELETE FROM form_submissions WHERE project_id = $1', [projectId]);
    await pgPool.query('DELETE FROM task_plans WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    const res = await pgPool.query('DELETE FROM projects WHERE id = $1 AND user_id = $2', [projectId, userId]);
    return (res.rowCount || 0) > 0;
  } else {
    const db = await getDbInstance();
    db.run('DELETE FROM messages WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    db.run('DELETE FROM vector_embeddings WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    db.run('DELETE FROM lessons WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    db.run('DELETE FROM brand_profiles WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM form_submissions WHERE project_id = ?', [projectId]);
    db.run('DELETE FROM task_plans WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    // Confirm the project row actually existed & belonged to this user before
    // reporting success — SQLite's db.run() doesn't give us affected-row count
    // directly here, so we check existence first.
    const checkStmt = db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?');
    checkStmt.bind([projectId, userId]);
    const existed = checkStmt.step();
    checkStmt.free();
    db.run('DELETE FROM projects WHERE id = ? AND user_id = ?', [projectId, userId]);
    saveDbToDisk();
    return existed;
  }
}

// Messages per Project (Strict Project & User Isolation)
export async function getMessages(projectId: string, userId: string): Promise<Message[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query(
      'SELECT * FROM messages WHERE project_id = $1 AND user_id = $2 ORDER BY created_at ASC',
      [projectId, userId]
    );
    return res.rows.map((row) => ({
      ...row,
      step_details: typeof row.step_details === 'string' ? JSON.parse(row.step_details) : row.step_details || [],
    }));
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare(
      'SELECT * FROM messages WHERE project_id = :projectId AND user_id = :userId ORDER BY created_at ASC'
    );
    stmt.bind({ ':projectId': projectId, ':userId': userId });
    const messages: Message[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      messages.push({
        id: String(row.id),
        project_id: String(row.project_id),
        user_id: String(row.user_id),
        role: row.role as 'user' | 'assistant' | 'system',
        content: String(row.content),
        reasoning: String(row.reasoning || ''),
        action_taken: String(row.action_taken || ''),
        step_details: row.step_details ? JSON.parse(String(row.step_details)) : [],
        created_at: String(row.created_at),
      });
    }
    stmt.free();
    return messages;
  }
}

export async function saveMessage(
  projectId: string,
  userId: string,
  role: 'user' | 'assistant' | 'system',
  content: string,
  reasoning = '',
  actionTaken = '',
  stepDetails: any[] = []
): Promise<Message> {
  const msg: Message = {
    id: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    user_id: userId,
    role,
    content,
    reasoning,
    action_taken: actionTaken,
    step_details: stepDetails,
    created_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO messages (id, project_id, user_id, role, content, reasoning, action_taken, step_details, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        msg.id,
        msg.project_id,
        msg.user_id,
        msg.role,
        msg.content,
        msg.reasoning || '',
        msg.action_taken || '',
        JSON.stringify(msg.step_details),
        msg.created_at,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO messages (id, project_id, user_id, role, content, reasoning, action_taken, step_details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        msg.id,
        msg.project_id,
        msg.user_id,
        msg.role,
        msg.content,
        msg.reasoning || '',
        msg.action_taken || '',
        JSON.stringify(msg.step_details),
        msg.created_at,
      ]
    );
    saveDbToDisk();
  }
  return msg;
}

// User Integration Tokens/Settings (Isolated per user)
export async function getUserSettings(userId: string): Promise<UserSettings> {
  const defaultSettings: UserSettings = {
    user_id: userId,
    github_token: '',
    github_owner: '',
    github_repo: '',
    vercel_token: '',
    vercel_team_id: '',
    vercel_project_id: '',
    firebase_db_url: '',
    firebase_secret: '',
    updated_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
    if (res.rows.length > 0) return { ...defaultSettings, ...res.rows[0] };
    return defaultSettings;
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM user_settings WHERE user_id = :userId');
    stmt.bind({ ':userId': userId });
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      stmt.free();
      return {
        user_id: userId,
        github_token: String(row.github_token || ''),
        github_owner: String(row.github_owner || ''),
        github_repo: String(row.github_repo || ''),
        vercel_token: String(row.vercel_token || ''),
        vercel_team_id: String(row.vercel_team_id || ''),
        vercel_project_id: String(row.vercel_project_id || ''),
        firebase_db_url: String(row.firebase_db_url || ''),
        firebase_secret: String(row.firebase_secret || ''),
        updated_at: String(row.updated_at || new Date().toISOString()),
      };
    }
    stmt.free();
    return defaultSettings;
  }
}

export async function saveUserSettings(userId: string, settings: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getUserSettings(userId);
  const updated: UserSettings = {
    ...current,
    ...settings,
    user_id: userId,
    updated_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO user_settings (user_id, github_token, github_owner, github_repo, vercel_token, vercel_team_id, vercel_project_id, firebase_db_url, firebase_secret, anthropic_api_key, preferred_model, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (user_id) DO UPDATE SET
         github_token = EXCLUDED.github_token,
         github_owner = EXCLUDED.github_owner,
         github_repo = EXCLUDED.github_repo,
         vercel_token = EXCLUDED.vercel_token,
         vercel_team_id = EXCLUDED.vercel_team_id,
         vercel_project_id = EXCLUDED.vercel_project_id,
         firebase_db_url = EXCLUDED.firebase_db_url,
         firebase_secret = EXCLUDED.firebase_secret,
         anthropic_api_key = EXCLUDED.anthropic_api_key,
         preferred_model = EXCLUDED.preferred_model,
         updated_at = EXCLUDED.updated_at`,
      [
        updated.user_id,
        updated.github_token,
        updated.github_owner,
        updated.github_repo,
        updated.vercel_token,
        updated.vercel_team_id,
        updated.vercel_project_id,
        updated.firebase_db_url,
        updated.firebase_secret,
        updated.anthropic_api_key || '',
        updated.preferred_model || 'gemini',
        updated.updated_at,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT OR REPLACE INTO user_settings (user_id, github_token, github_owner, github_repo, vercel_token, vercel_team_id, vercel_project_id, firebase_db_url, firebase_secret, anthropic_api_key, preferred_model, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        updated.user_id,
        updated.github_token,
        updated.github_owner,
        updated.github_repo,
        updated.vercel_token,
        updated.vercel_team_id,
        updated.vercel_project_id,
        updated.firebase_db_url,
        updated.firebase_secret,
        updated.anthropic_api_key || '',
        updated.preferred_model || 'gemini',
        updated.updated_at,
      ]
    );
    saveDbToDisk();
  }
  return updated;
}

// Vector Embeddings & RAG Storage
export async function saveVectorEmbedding(
  projectId: string,
  userId: string,
  docType: string,
  title: string,
  content: string,
  embedding: number[]
): Promise<VectorEmbedding> {
  const item: VectorEmbedding = {
    id: `vec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    user_id: userId,
    doc_type: docType,
    title,
    content,
    embedding,
    created_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO vector_embeddings (id, project_id, user_id, doc_type, title, content, embedding, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [item.id, item.project_id, item.user_id, item.doc_type, item.title, item.content, JSON.stringify(item.embedding), item.created_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO vector_embeddings (id, project_id, user_id, doc_type, title, content, embedding, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [item.id, item.project_id, item.user_id, item.doc_type, item.title, item.content, JSON.stringify(item.embedding), item.created_at]
    );
    saveDbToDisk();
  }
  return item;
}

export async function getVectorEmbeddings(projectId: string, userId: string): Promise<VectorEmbedding[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query(
      'SELECT * FROM vector_embeddings WHERE project_id = $1 AND user_id = $2 ORDER BY created_at DESC',
      [projectId, userId]
    );
    return res.rows.map((row) => ({
      ...row,
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding || [],
    }));
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare(
      'SELECT * FROM vector_embeddings WHERE project_id = :projectId AND user_id = :userId ORDER BY created_at DESC'
    );
    stmt.bind({ ':projectId': projectId, ':userId': userId });
    const items: VectorEmbedding[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      items.push({
        id: String(row.id),
        project_id: String(row.project_id),
        user_id: String(row.user_id),
        doc_type: String(row.doc_type),
        title: String(row.title),
        content: String(row.content),
        embedding: row.embedding ? JSON.parse(String(row.embedding)) : [],
        created_at: String(row.created_at),
      });
    }
    stmt.free();
    return items;
  }
}

// Lessons Storage & Operations
export async function getLessons(
  projectId: string | null | undefined,
  userId: string,
  includeGlobal = true
): Promise<Lesson[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    let query = 'SELECT * FROM lessons WHERE user_id = $1';
    const params: any[] = [userId];
    if (projectId && includeGlobal) {
      query += " AND (project_id = $2 OR project_id IS NULL OR project_id = '')";
      params.push(projectId);
    } else if (projectId) {
      query += ' AND project_id = $2';
      params.push(projectId);
    }
    query += ' ORDER BY occurrence_count DESC, updated_at DESC';
    const res = await pgPool.query(query, params);
    return res.rows.map((row) => ({
      ...row,
      project_id: row.project_id || null,
      occurrence_count: Number(row.occurrence_count || 1),
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding || [],
    }));
  } else {
    const db = await getDbInstance();
    let query = 'SELECT * FROM lessons WHERE user_id = :userId';
    const params: Record<string, any> = { ':userId': userId };
    if (projectId && includeGlobal) {
      query += ' AND (project_id = :projectId OR project_id IS NULL OR project_id = "")';
      params[':projectId'] = projectId;
    } else if (projectId) {
      query += ' AND project_id = :projectId';
      params[':projectId'] = projectId;
    }
    query += ' ORDER BY occurrence_count DESC, updated_at DESC';

    const stmt = db.prepare(query);
    stmt.bind(params);
    const lessons: Lesson[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      lessons.push({
        id: String(row.id),
        project_id: row.project_id ? String(row.project_id) : null,
        user_id: String(row.user_id),
        lesson_type: row.lesson_type as Lesson['lesson_type'],
        trigger_summary: String(row.trigger_summary || ''),
        fix_or_rule: String(row.fix_or_rule || ''),
        occurrence_count: Number(row.occurrence_count || 1),
        embedding: row.embedding ? JSON.parse(String(row.embedding)) : [],
        created_at: String(row.created_at || ''),
        updated_at: String(row.updated_at || ''),
      });
    }
    stmt.free();
    return lessons;
  }
}

export async function saveLesson(data: {
  id?: string;
  project_id?: string | null;
  user_id: string;
  lesson_type: Lesson['lesson_type'];
  trigger_summary: string;
  fix_or_rule: string;
  occurrence_count?: number;
  embedding?: number[];
}): Promise<Lesson> {
  const now = new Date().toISOString();
  const existingLessons = await getLessons(data.project_id, data.user_id, true);
  const triggerLower = data.trigger_summary.trim().toLowerCase();
  const existing = existingLessons.find(
    (l) => l.trigger_summary.trim().toLowerCase() === triggerLower
  );

  if (existing) {
    const newCount = (existing.occurrence_count || 1) + (data.occurrence_count || 1);
    let newType = existing.lesson_type;
    if (newCount >= 3 && (existing.lesson_type === 'validation_error' || existing.lesson_type === 'deployment_failure')) {
      newType = 'repeated_failure';
    } else if (data.lesson_type === 'repeated_failure' || data.lesson_type === 'user_correction') {
      newType = data.lesson_type;
    }

    const updatedLesson: Lesson = {
      ...existing,
      lesson_type: newType,
      fix_or_rule: data.fix_or_rule || existing.fix_or_rule,
      occurrence_count: newCount,
      embedding: data.embedding && data.embedding.length > 0 ? data.embedding : existing.embedding,
      updated_at: now,
    };

    if (isPgAvailable && pgPool) {
      await ensurePgSchemaReady();
      await pgPool.query(
        `UPDATE lessons SET lesson_type = $1, fix_or_rule = $2, occurrence_count = $3, embedding = $4, updated_at = $5 WHERE id = $6 AND user_id = $7`,
        [
          updatedLesson.lesson_type,
          updatedLesson.fix_or_rule,
          updatedLesson.occurrence_count,
          JSON.stringify(updatedLesson.embedding || []),
          updatedLesson.updated_at,
          updatedLesson.id,
          updatedLesson.user_id,
        ]
      );
    } else {
      const db = await getDbInstance();
      db.run(
        `UPDATE lessons SET lesson_type = ?, fix_or_rule = ?, occurrence_count = ?, embedding = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
        [
          updatedLesson.lesson_type,
          updatedLesson.fix_or_rule,
          updatedLesson.occurrence_count,
          JSON.stringify(updatedLesson.embedding || []),
          updatedLesson.updated_at,
          updatedLesson.id,
          updatedLesson.user_id,
        ]
      );
      saveDbToDisk();
    }
    return updatedLesson;
  }

  const newLesson: Lesson = {
    id: data.id || `les_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: data.project_id || null,
    user_id: data.user_id,
    lesson_type: data.lesson_type,
    trigger_summary: data.trigger_summary,
    fix_or_rule: data.fix_or_rule,
    occurrence_count: data.occurrence_count || 1,
    embedding: data.embedding || [],
    created_at: now,
    updated_at: now,
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO lessons (id, project_id, user_id, lesson_type, trigger_summary, fix_or_rule, occurrence_count, embedding, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newLesson.id,
        newLesson.project_id || null,
        newLesson.user_id,
        newLesson.lesson_type,
        newLesson.trigger_summary,
        newLesson.fix_or_rule,
        newLesson.occurrence_count,
        JSON.stringify(newLesson.embedding || []),
        newLesson.created_at,
        newLesson.updated_at,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO lessons (id, project_id, user_id, lesson_type, trigger_summary, fix_or_rule, occurrence_count, embedding, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newLesson.id,
        newLesson.project_id || null,
        newLesson.user_id,
        newLesson.lesson_type,
        newLesson.trigger_summary,
        newLesson.fix_or_rule,
        newLesson.occurrence_count,
        JSON.stringify(newLesson.embedding || []),
        newLesson.created_at,
        newLesson.updated_at,
      ]
    );
    saveDbToDisk();
  }
  return newLesson;
}

export async function incrementLessonOccurrence(lessonId: string, userId: string): Promise<Lesson | null> {
  const lessons = await getLessons(null, userId, true);
  const target = lessons.find((l) => l.id === lessonId);
  if (!target) return null;

  return saveLesson({
    id: target.id,
    project_id: target.project_id,
    user_id: target.user_id,
    lesson_type: target.lesson_type,
    trigger_summary: target.trigger_summary,
    fix_or_rule: target.fix_or_rule,
    occurrence_count: 1,
    embedding: target.embedding,
  });
}

export async function deleteLesson(lessonId: string, userId: string): Promise<boolean> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('DELETE FROM lessons WHERE id = $1 AND user_id = $2', [lessonId, userId]);
    return (res.rowCount || 0) > 0;
  } else {
    const db = await getDbInstance();
    db.run('DELETE FROM lessons WHERE id = ? AND user_id = ?', [lessonId, userId]);
    saveDbToDisk();
    return true;
  }
}

// Brand Profiles Operations
export async function getBrandProfile(projectId: string): Promise<BrandProfile | null> {
  if (!projectId) return null;
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM brand_profiles WHERE project_id = $1', [projectId]);
    if (res.rows.length > 0) return res.rows[0];
    return null;
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM brand_profiles WHERE project_id = :projectId');
    stmt.bind({ ':projectId': projectId });
    let profile: BrandProfile | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      profile = {
        project_id: String(row.project_id),
        primary_color: String(row.primary_color || ''),
        secondary_color: row.secondary_color ? String(row.secondary_color) : null,
        accent_color: row.accent_color ? String(row.accent_color) : null,
        font_family: row.font_family ? String(row.font_family) : null,
        tone: row.tone ? String(row.tone) : null,
        logo_description: row.logo_description ? String(row.logo_description) : null,
        additional_notes: row.additional_notes ? String(row.additional_notes) : null,
        updated_at: String(row.updated_at || ''),
      };
    }
    stmt.free();
    return profile;
  }
}

export async function saveBrandProfile(projectId: string, data: Partial<BrandProfile>): Promise<BrandProfile> {
  const now = new Date().toISOString();
  const existing = await getBrandProfile(projectId);
  const updated: BrandProfile = {
    project_id: projectId,
    primary_color: data.primary_color ?? existing?.primary_color ?? '#3b82f6',
    secondary_color: data.secondary_color !== undefined ? data.secondary_color : existing?.secondary_color ?? null,
    accent_color: data.accent_color !== undefined ? data.accent_color : existing?.accent_color ?? null,
    font_family: data.font_family !== undefined ? data.font_family : existing?.font_family ?? null,
    tone: data.tone !== undefined ? data.tone : existing?.tone ?? null,
    logo_description: data.logo_description !== undefined ? data.logo_description : existing?.logo_description ?? null,
    additional_notes: data.additional_notes !== undefined ? data.additional_notes : existing?.additional_notes ?? null,
    updated_at: now,
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO brand_profiles (project_id, primary_color, secondary_color, accent_color, font_family, tone, logo_description, additional_notes, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (project_id) DO UPDATE SET
         primary_color = EXCLUDED.primary_color,
         secondary_color = EXCLUDED.secondary_color,
         accent_color = EXCLUDED.accent_color,
         font_family = EXCLUDED.font_family,
         tone = EXCLUDED.tone,
         logo_description = EXCLUDED.logo_description,
         additional_notes = EXCLUDED.additional_notes,
         updated_at = EXCLUDED.updated_at`,
      [
        updated.project_id,
        updated.primary_color,
        updated.secondary_color || null,
        updated.accent_color || null,
        updated.font_family || null,
        updated.tone || null,
        updated.logo_description || null,
        updated.additional_notes || null,
        updated.updated_at,
      ]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT OR REPLACE INTO brand_profiles (project_id, primary_color, secondary_color, accent_color, font_family, tone, logo_description, additional_notes, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        updated.project_id,
        updated.primary_color,
        updated.secondary_color || null,
        updated.accent_color || null,
        updated.font_family || null,
        updated.tone || null,
        updated.logo_description || null,
        updated.additional_notes || null,
        updated.updated_at,
      ]
    );
    saveDbToDisk();
  }
  return updated;
}

// Form Submissions Operations
export async function getFormSubmissions(projectId: string): Promise<FormSubmission[]> {
  if (!projectId) return [];
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM form_submissions WHERE project_id = $1 ORDER BY submitted_at DESC', [projectId]);
    return res.rows.map((row) => ({
      id: row.id,
      project_id: row.project_id,
      form_name: row.form_name,
      submitted_data: typeof row.submitted_data === 'string' ? JSON.parse(row.submitted_data) : row.submitted_data || {},
      submitted_at: row.submitted_at,
    }));
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM form_submissions WHERE project_id = :projectId ORDER BY submitted_at DESC');
    stmt.bind({ ':projectId': projectId });
    const list: FormSubmission[] = [];
    while (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      list.push({
        id: String(row.id),
        project_id: String(row.project_id),
        form_name: String(row.form_name || 'contact'),
        submitted_data: row.submitted_data ? JSON.parse(String(row.submitted_data)) : {},
        submitted_at: String(row.submitted_at || ''),
      });
    }
    stmt.free();
    return list;
  }
}

export async function saveFormSubmission(projectId: string, formName: string, data: Record<string, any>): Promise<FormSubmission> {
  const now = new Date().toISOString();
  const submission: FormSubmission = {
    id: `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    form_name: formName || 'contact',
    submitted_data: data,
    submitted_at: now,
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO form_submissions (id, project_id, form_name, submitted_data, submitted_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [submission.id, submission.project_id, submission.form_name, JSON.stringify(submission.submitted_data), submission.submitted_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO form_submissions (id, project_id, form_name, submitted_data, submitted_at)
       VALUES (?, ?, ?, ?, ?)`,
      [submission.id, submission.project_id, submission.form_name, JSON.stringify(submission.submitted_data), submission.submitted_at]
    );
    saveDbToDisk();
  }
  return submission;
}

// Task Plans Operations (Autonomous Multi-step Planning)
export async function createTaskPlan(
  projectId: string,
  userId: string,
  originalPrompt: string,
  rawTasks: { id: string; description: string }[]
): Promise<TaskPlan> {
  const now = new Date().toISOString();
  const id = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const tasks: TaskPlanItem[] = rawTasks.map((t) => ({
    id: t.id,
    description: t.description,
    status: 'pending',
    retry_count: 0,
  }));

  const plan: TaskPlan = {
    id,
    project_id: projectId,
    user_id: userId,
    original_prompt: originalPrompt,
    tasks,
    overall_status: 'in_progress',
    created_at: now,
    updated_at: now,
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO task_plans (id, project_id, user_id, original_prompt, tasks, overall_status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [plan.id, plan.project_id, plan.user_id, plan.original_prompt, JSON.stringify(plan.tasks), plan.overall_status, plan.created_at, plan.updated_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO task_plans (id, project_id, user_id, original_prompt, tasks, overall_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [plan.id, plan.project_id, plan.user_id, plan.original_prompt, JSON.stringify(plan.tasks), plan.overall_status, plan.created_at, plan.updated_at]
    );
    saveDbToDisk();
  }
  return plan;
}

export async function updateTaskPlan(
  id: string,
  tasks: TaskPlanItem[],
  overallStatus: 'pending' | 'pending_approval' | 'in_progress' | 'completed' | 'failed'
): Promise<void> {
  const now = new Date().toISOString();
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `UPDATE task_plans SET tasks = $1, overall_status = $2, updated_at = $3 WHERE id = $4`,
      [JSON.stringify(tasks), overallStatus, now, id]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `UPDATE task_plans SET tasks = ?, overall_status = ?, updated_at = ? WHERE id = ?`,
      [JSON.stringify(tasks), overallStatus, now, id]
    );
    saveDbToDisk();
  }
}

export async function getActiveTaskPlan(projectId: string): Promise<TaskPlan | null> {
  if (!projectId) return null;
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM task_plans WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1', [projectId]);
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    return {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      original_prompt: row.original_prompt,
      tasks: typeof row.tasks === 'string' ? JSON.parse(row.tasks) : row.tasks || [],
      overall_status: row.overall_status,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM task_plans WHERE project_id = :projectId ORDER BY created_at DESC LIMIT 1');
    stmt.bind({ ':projectId': projectId });
    let plan: TaskPlan | null = null;
    if (stmt.step()) {
      const row = stmt.getAsObject() as Record<string, any>;
      plan = {
        id: String(row.id),
        project_id: String(row.project_id),
        user_id: String(row.user_id),
        original_prompt: String(row.original_prompt),
        tasks: row.tasks ? JSON.parse(String(row.tasks)) : [],
        overall_status: String(row.overall_status) as any,
        created_at: String(row.created_at),
        updated_at: String(row.updated_at),
      };
    }
    stmt.free();
    return plan;
  }
}

// =====================================================
// SPEC / REQUIREMENT MANAGEMENT
// =====================================================

export async function createSpec(
  projectId: string,
  userId: string,
  rawRequirement: string,
  structuredSpec: object
): Promise<Spec> {
  const now = new Date().toISOString();
  const spec: Spec = {
    id: `spec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    user_id: userId,
    raw_requirement: rawRequirement,
    structured_spec: JSON.stringify(structuredSpec),
    status: 'draft',
    created_at: now,
    updated_at: now,
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO specs (id, project_id, user_id, raw_requirement, structured_spec, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [spec.id, spec.project_id, spec.user_id, spec.raw_requirement, spec.structured_spec, spec.status, spec.created_at, spec.updated_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO specs (id, project_id, user_id, raw_requirement, structured_spec, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [spec.id, spec.project_id, spec.user_id, spec.raw_requirement, spec.structured_spec, spec.status, spec.created_at, spec.updated_at]
    );
    saveDbToDisk();
  }
  return spec;
}

export async function getLatestSpec(projectId: string): Promise<Spec | null> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query(
      'SELECT * FROM specs WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1',
      [projectId]
    );
    return res.rows.length > 0 ? (res.rows[0] as Spec) : null;
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM specs WHERE project_id = :projectId ORDER BY created_at DESC LIMIT 1');
    stmt.bind({ ':projectId': projectId });
    let spec: Spec | null = null;
    if (stmt.step()) {
      spec = stmt.getAsObject() as unknown as Spec;
    }
    stmt.free();
    return spec;
  }
}

export async function updateSpecStatus(specId: string, status: Spec['status']): Promise<void> {
  const now = new Date().toISOString();
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query('UPDATE specs SET status = $1, updated_at = $2 WHERE id = $3', [status, now, specId]);
  } else {
    const db = await getDbInstance();
    db.run('UPDATE specs SET status = ?, updated_at = ? WHERE id = ?', [status, now, specId]);
    saveDbToDisk();
  }
}

// =====================================================
// TEAM COLLABORATION (project members & roles)
// =====================================================

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectMember['role'],
  invitedBy: string
): Promise<ProjectMember> {
  const member: ProjectMember = {
    id: `mem_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    user_id: userId,
    role,
    invited_by: invitedBy,
    created_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO project_members (id, project_id, user_id, role, invited_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [member.id, member.project_id, member.user_id, member.role, member.invited_by, member.created_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO project_members (id, project_id, user_id, role, invited_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [member.id, member.project_id, member.user_id, member.role, member.invited_by, member.created_at]
    );
    saveDbToDisk();
  }
  return member;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM project_members WHERE project_id = $1 ORDER BY created_at ASC', [projectId]);
    return res.rows as ProjectMember[];
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM project_members WHERE project_id = :projectId ORDER BY created_at ASC');
    stmt.bind({ ':projectId': projectId });
    const rows: ProjectMember[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as ProjectMember);
    }
    stmt.free();
    return rows;
  }
}

// Returns the caller's role on a project: the creator (projects.user_id) is
// always 'owner'; otherwise looks up project_members. Null = no access.
export async function getUserRoleForProject(projectId: string, userId: string): Promise<ProjectMember['role'] | null> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const projRes = await pgPool.query('SELECT user_id FROM projects WHERE id = $1', [projectId]);
    if (projRes.rows.length > 0 && projRes.rows[0].user_id === userId) return 'owner';
    const memRes = await pgPool.query('SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
    return memRes.rows.length > 0 ? memRes.rows[0].role : null;
  } else {
    const db = await getDbInstance();
    const projStmt = db.prepare('SELECT user_id FROM projects WHERE id = :projectId');
    projStmt.bind({ ':projectId': projectId });
    let ownerId: string | null = null;
    if (projStmt.step()) ownerId = String(projStmt.getAsObject().user_id);
    projStmt.free();
    if (ownerId === userId) return 'owner';

    const memStmt = db.prepare('SELECT role FROM project_members WHERE project_id = :projectId AND user_id = :userId');
    memStmt.bind({ ':projectId': projectId, ':userId': userId });
    let role: ProjectMember['role'] | null = null;
    if (memStmt.step()) role = String(memStmt.getAsObject().role) as ProjectMember['role'];
    memStmt.free();
    return role;
  }
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query('DELETE FROM project_members WHERE project_id = $1 AND user_id = $2', [projectId, userId]);
  } else {
    const db = await getDbInstance();
    db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    saveDbToDisk();
  }
}

// =====================================================
// PULL REQUEST AUTOMATION (record-keeping)
// =====================================================

export async function recordPullRequest(
  projectId: string,
  userId: string,
  data: { branchName: string; prUrl: string; prNumber: number; title: string; reviewSummary: string }
): Promise<PullRequestRecord> {
  const record: PullRequestRecord = {
    id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    project_id: projectId,
    user_id: userId,
    branch_name: data.branchName,
    pr_url: data.prUrl,
    pr_number: data.prNumber,
    title: data.title,
    review_summary: data.reviewSummary,
    status: 'open',
    created_at: new Date().toISOString(),
  };

  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    await pgPool.query(
      `INSERT INTO pull_requests (id, project_id, user_id, branch_name, pr_url, pr_number, title, review_summary, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [record.id, record.project_id, record.user_id, record.branch_name, record.pr_url, record.pr_number, record.title, record.review_summary, record.status, record.created_at]
    );
  } else {
    const db = await getDbInstance();
    db.run(
      `INSERT INTO pull_requests (id, project_id, user_id, branch_name, pr_url, pr_number, title, review_summary, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.project_id, record.user_id, record.branch_name, record.pr_url, record.pr_number, record.title, record.review_summary, record.status, record.created_at]
    );
    saveDbToDisk();
  }
  return record;
}

export async function getPullRequests(projectId: string): Promise<PullRequestRecord[]> {
  if (isPgAvailable && pgPool) {
    await ensurePgSchemaReady();
    const res = await pgPool.query('SELECT * FROM pull_requests WHERE project_id = $1 ORDER BY created_at DESC', [projectId]);
    return res.rows as PullRequestRecord[];
  } else {
    const db = await getDbInstance();
    const stmt = db.prepare('SELECT * FROM pull_requests WHERE project_id = :projectId ORDER BY created_at DESC');
    stmt.bind({ ':projectId': projectId });
    const rows: PullRequestRecord[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as PullRequestRecord);
    }
    stmt.free();
    return rows;
  }
}

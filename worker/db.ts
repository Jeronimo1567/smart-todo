import { TOPIC_COLORS, type SyncOp, type SyncResponse, type Task, type Topic } from "../shared/types"

export type Env = {
  DB: D1Database
  ASSETS: Fetcher
  APP_PASSWORD: string
  SESSION_SECRET: string
  MCP_TOKEN: string
  VAPID_PUBLIC_KEY: string
  VAPID_PRIVATE_JWK: string
  VAPID_SUBJECT: string
  DEFAULT_TIMEZONE: string
  RESEND_API_KEY?: string
  DIGEST_EMAIL?: string
}

type Row = Record<string, unknown>

export function rowToTask(r: Row): Task {
  return {
    id: r.id as string,
    title: r.title as string,
    notes: r.notes as string,
    topicId: (r.topic_id as string) ?? null,
    dueAt: (r.due_at as number) ?? null,
    allDay: !!r.all_day,
    important: !!r.important,
    doneAt: (r.done_at as number) ?? null,
    snoozedUntil: (r.snoozed_until as number) ?? null,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    deleted: !!r.deleted,
  }
}

export function rowToTopic(r: Row): Topic {
  return {
    id: r.id as string,
    name: r.name as string,
    color: r.color as Topic["color"],
    position: r.position as number,
    updatedAt: r.updated_at as number,
    deleted: !!r.deleted,
  }
}

// Whitelisted columns per entity: patch key -> [column, validator/encoder]
type Col = [string, (v: unknown) => unknown]
const str = (max: number) => (v: unknown) => (typeof v === "string" ? v.slice(0, max) : undefined)
const numOrNull = (v: unknown) => (v === null ? null : typeof v === "number" && Number.isFinite(v) ? v : undefined)
const bool = (v: unknown) => (typeof v === "boolean" ? (v ? 1 : 0) : undefined)
const strOrNull = (v: unknown) => (v === null ? null : typeof v === "string" ? v.slice(0, 64) : undefined)

const TASK_COLS: Record<string, Col> = {
  title: ["title", str(500)],
  notes: ["notes", str(5000)],
  topicId: ["topic_id", strOrNull],
  dueAt: ["due_at", numOrNull],
  allDay: ["all_day", bool],
  important: ["important", bool],
  doneAt: ["done_at", numOrNull],
  snoozedUntil: ["snoozed_until", numOrNull],
  createdAt: ["created_at", numOrNull],
  deleted: ["deleted", bool],
}

const TOPIC_COLS: Record<string, Col> = {
  name: ["name", str(60)],
  color: ["color", (v) => (TOPIC_COLORS.includes(v as never) ? v : undefined)],
  position: ["position", numOrNull],
  deleted: ["deleted", bool],
}

/** Build an upsert that only touches the patched columns. */
function upsert(db: D1Database, table: string, cols: Record<string, Col>, id: string, patch: Row, now: number) {
  const names: string[] = []
  const values: unknown[] = []
  for (const [key, raw] of Object.entries(patch)) {
    const col = cols[key]
    if (!col) continue
    const v = col[1](raw)
    if (v === undefined) continue
    names.push(col[0])
    values.push(v)
  }
  const all = ["id", ...names, "updated_at"]
  const sql =
    `INSERT INTO ${table} (${all.join(",")}) VALUES (${all.map(() => "?").join(",")}) ` +
    `ON CONFLICT(id) DO UPDATE SET ${[...names, "updated_at"].map((n) => `${n}=excluded.${n}`).join(",")}`
  return db.prepare(sql).bind(id, ...values, now)
}

export function applyOps(env: Env, ops: SyncOp[], now = Date.now()) {
  const stmts = ops
    .filter((op) => typeof op?.id === "string" && op.id.length <= 64 && op.patch && typeof op.patch === "object")
    .map((op) =>
      op.t === "task"
        ? upsert(env.DB, "tasks", TASK_COLS, op.id, op.patch as Row, now)
        : upsert(env.DB, "topics", TOPIC_COLS, op.id, op.patch as Row, now)
    )
  return stmts.length ? env.DB.batch(stmts) : Promise.resolve([])
}

export async function changesSince(env: Env, since: number): Promise<SyncResponse> {
  const now = Date.now()
  const [tasks, topics] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM tasks WHERE updated_at > ?").bind(since),
    env.DB.prepare("SELECT * FROM topics WHERE updated_at > ?").bind(since),
  ])
  return {
    tasks: (tasks.results as Row[]).map(rowToTask),
    topics: (topics.results as Row[]).map(rowToTopic),
    now,
  }
}

export async function getSetting(env: Env, key: string) {
  const r = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>()
  return r?.value ?? null
}

export function setSetting(env: Env, key: string, value: string) {
  return env.DB.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  )
    .bind(key, value)
    .run()
}

export async function getTimezone(env: Env) {
  return (await getSetting(env, "timezone")) ?? env.DEFAULT_TIMEZONE
}

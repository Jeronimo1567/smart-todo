// Minimal stateless MCP server (Streamable HTTP transport, JSON responses).
// Lets Claude read and manage the todo list: "what's due this week?",
// "add 'send invoice' to Work for Friday 3pm, important", etc.

import { DAY, effectiveDue, formatLocal, localParts, parseLocalDue, startOfLocalDay } from "../shared/time"
import { TOPIC_COLORS, TOPIC_ICONS, type SyncOp, type Task, type TaskPatch, type Topic } from "../shared/types"
import { type Env, applyOps, getTimezone, rowToTask, rowToTopic } from "./db"

type Json = Record<string, unknown>
type Ctx = { env: Env; tz: string; now: number }

const DUE_HELP =
  'Local date "YYYY-MM-DD" (all-day) or local date-time "YYYY-MM-DDTHH:mm". Use null to clear. Call get_overview first if you need today\'s date.'

const tools = [
  {
    name: "get_overview",
    description:
      "Start here. Returns the current local date/time, all topics (the user's lists) with open-task counts, plus overdue, due-today and next-7-days tasks.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_tasks",
    description: "List tasks, optionally filtered by topic, status, due window or text search.",
    inputSchema: {
      type: "object",
      properties: {
        topic: { type: "string", description: "Topic name (case-insensitive, prefix ok)" },
        status: { type: "string", enum: ["open", "done", "all"], default: "open" },
        due_within_days: { type: "number", description: "Only tasks due within N days from now (includes overdue)" },
        search: { type: "string", description: "Substring match on title/notes" },
        limit: { type: "number", default: 100 },
      },
    },
  },
  {
    name: "add_task",
    description: "Create a task.",
    inputSchema: {
      type: "object",
      required: ["title"],
      properties: {
        title: { type: "string" },
        topic: { type: "string", description: "Existing topic name. Omit for no topic." },
        due: { type: ["string", "null"], description: DUE_HELP },
        important: { type: "boolean", description: "Important tasks get repeated push reminders until done." },
        notes: { type: "string" },
      },
    },
  },
  {
    name: "update_task",
    description: "Edit a task. Only the fields you pass are changed.",
    inputSchema: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string" },
        title: { type: "string" },
        topic: { type: ["string", "null"] },
        due: { type: ["string", "null"], description: DUE_HELP },
        important: { type: "boolean" },
        notes: { type: "string" },
        done: { type: "boolean" },
        snooze_minutes: { type: "number", description: "Silence reminders for N minutes" },
      },
    },
  },
  {
    name: "complete_tasks",
    description: "Mark one or more tasks as done.",
    inputSchema: {
      type: "object",
      required: ["ids"],
      properties: { ids: { type: "array", items: { type: "string" } } },
    },
  },
  {
    name: "delete_task",
    description: "Delete a task permanently from the list.",
    inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
  },
  {
    name: "add_topic",
    description: "Create a new topic (a list such as 'Gym' or 'Side project').",
    inputSchema: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        color: { type: "string", enum: [...TOPIC_COLORS] },
        icon: { type: "string", enum: [...TOPIC_ICONS], description: "Lucide icon name" },
      },
    },
  },
]

// ---------- data helpers ----------

async function loadTopics(env: Env) {
  const { results } = await env.DB.prepare("SELECT * FROM topics WHERE deleted = 0 ORDER BY position").all<Json>()
  return results.map(rowToTopic)
}

function findTopic(topics: Topic[], name: string) {
  const q = name.trim().toLowerCase()
  return (
    topics.find((t) => t.name.toLowerCase() === q) ??
    topics.find((t) => t.name.toLowerCase().startsWith(q)) ??
    topics.find((t) => t.name.toLowerCase().replace(/\s+/g, "").includes(q.replace(/\s+/g, "")))
  )
}

function resolveTopic(topics: Topic[], name: unknown): string | null {
  if (name === null || name === undefined || name === "") return null
  const t = findTopic(topics, String(name))
  if (!t) throw new Error(`No topic named "${name}". Existing topics: ${topics.map((t) => t.name).join(", ")}. Use add_topic to create one.`)
  return t.id
}

function resolveDue(due: unknown, tz: string): Pick<TaskPatch, "dueAt" | "allDay"> {
  if (due === null || due === "") return { dueAt: null, allDay: false }
  const parsed = parseLocalDue(String(due), tz)
  if (!parsed) throw new Error(`Couldn't read due "${due}". ${DUE_HELP}`)
  return parsed
}

function describe(t: Task, ctx: Ctx, topics: Topic[]) {
  const topic = topics.find((x) => x.id === t.topicId)?.name
  const parts = [`[${t.id}]`, t.title]
  if (topic) parts.push(`#${topic}`)
  if (t.dueAt !== null) {
    const overdue = !t.doneAt && effectiveDue(t.dueAt, t.allDay) <= ctx.now
    parts.push(`due ${formatLocal(t.dueAt, t.allDay, ctx.tz)}${overdue ? " (OVERDUE)" : ""}`)
  }
  if (t.important) parts.push("❗important")
  if (t.doneAt) parts.push("✓ done")
  if (t.snoozedUntil && t.snoozedUntil > ctx.now) parts.push(`snoozed until ${formatLocal(t.snoozedUntil, false, ctx.tz)}`)
  if (t.notes) parts.push(`— ${t.notes.replace(/\s+/g, " ").slice(0, 200)}`)
  return parts.join(" · ")
}

async function openTasks(env: Env) {
  const { results } = await env.DB.prepare(
    "SELECT * FROM tasks WHERE deleted = 0 AND done_at IS NULL ORDER BY due_at IS NULL, due_at, created_at"
  ).all<Json>()
  return results.map(rowToTask)
}

async function getTask(env: Env, id: string) {
  const r = await env.DB.prepare("SELECT * FROM tasks WHERE id = ? AND deleted = 0").bind(id).first<Json>()
  if (!r) throw new Error(`No task with id ${id}`)
  return rowToTask(r)
}

// ---------- tool implementations ----------

async function callTool(name: string, args: Json, ctx: Ctx): Promise<string> {
  const { env, tz, now } = ctx
  const topics = await loadTopics(env)
  const lines = (ts: Task[]) => (ts.length ? ts.map((t) => "- " + describe(t, ctx, topics)).join("\n") : "(none)")

  switch (name) {
    case "get_overview": {
      const open = await openTasks(env)
      const todayStart = startOfLocalDay(now, tz)
      const overdue = open.filter((t) => t.dueAt !== null && effectiveDue(t.dueAt, t.allDay) <= now)
      const today = open.filter((t) => !overdue.includes(t) && t.dueAt !== null && t.dueAt < todayStart + DAY)
      const week = open.filter((t) => t.dueAt !== null && t.dueAt >= todayStart + DAY && t.dueAt < todayStart + 8 * DAY)
      const p = localParts(now, tz)
      return [
        `Now: ${formatLocal(now, false, tz)} (${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}, time zone ${tz})`,
        `Topics: ${topics.map((t) => `${t.name} (${open.filter((x) => x.topicId === t.id).length} open)`).join(", ")}`,
        `No topic: ${open.filter((x) => !x.topicId).length} open`,
        `\nOVERDUE:\n${lines(overdue)}`,
        `\nDUE TODAY:\n${lines(today)}`,
        `\nNEXT 7 DAYS:\n${lines(week)}`,
      ].join("\n")
    }

    case "list_tasks": {
      const status = (args.status as string) ?? "open"
      let sql = "SELECT * FROM tasks WHERE deleted = 0"
      const binds: unknown[] = []
      if (status === "open") sql += " AND done_at IS NULL"
      if (status === "done") sql += " AND done_at IS NOT NULL"
      if (args.topic) {
        sql += " AND topic_id = ?"
        binds.push(resolveTopic(topics, args.topic))
      }
      if (typeof args.due_within_days === "number") {
        sql += " AND due_at IS NOT NULL AND due_at < ?"
        binds.push(now + args.due_within_days * DAY)
      }
      if (args.search) {
        sql += " AND (title LIKE ? OR notes LIKE ?)"
        binds.push(`%${args.search}%`, `%${args.search}%`)
      }
      sql += status === "done" ? " ORDER BY done_at DESC" : " ORDER BY due_at IS NULL, due_at, created_at"
      sql += " LIMIT ?"
      binds.push(Math.min(Number(args.limit) || 100, 500))
      const { results } = await env.DB.prepare(sql).bind(...binds).all<Json>()
      return lines(results.map(rowToTask))
    }

    case "add_task": {
      const title = String(args.title ?? "").trim()
      if (!title) throw new Error("title is required")
      const id = crypto.randomUUID()
      const patch: TaskPatch = {
        title,
        notes: (args.notes as string) ?? "",
        topicId: resolveTopic(topics, args.topic),
        important: !!args.important,
        createdAt: now,
        ...(args.due !== undefined ? resolveDue(args.due, tz) : {}),
      }
      await applyOps(env, [{ t: "task", id, patch }], now)
      return "Added: " + describe(await getTask(env, id), ctx, topics)
    }

    case "update_task": {
      const id = String(args.id)
      await getTask(env, id)
      const patch: TaskPatch = {}
      if (args.title !== undefined) patch.title = String(args.title)
      if (args.notes !== undefined) patch.notes = String(args.notes)
      if (args.topic !== undefined) patch.topicId = resolveTopic(topics, args.topic)
      if (args.due !== undefined) Object.assign(patch, resolveDue(args.due, tz))
      if (args.important !== undefined) patch.important = !!args.important
      if (args.done !== undefined) patch.doneAt = args.done ? now : null
      if (typeof args.snooze_minutes === "number") patch.snoozedUntil = now + args.snooze_minutes * 60_000
      await applyOps(env, [{ t: "task", id, patch }], now)
      return "Updated: " + describe(await getTask(env, id), ctx, topics)
    }

    case "complete_tasks": {
      const ids = (Array.isArray(args.ids) ? args.ids : [args.ids]).map(String)
      const ops: SyncOp[] = ids.map((id) => ({ t: "task", id, patch: { doneAt: now } }))
      for (const id of ids) await getTask(env, id)
      await applyOps(env, ops, now)
      return `Completed ${ids.length} task(s).`
    }

    case "delete_task": {
      const t = await getTask(env, String(args.id))
      await applyOps(env, [{ t: "task", id: t.id, patch: { deleted: true } }], now)
      return `Deleted: ${t.title}`
    }

    case "add_topic": {
      const name = String(args.name ?? "").trim()
      if (!name) throw new Error("name is required")
      const existing = topics.find((t) => t.name.toLowerCase() === name.toLowerCase())
      if (existing) return `Topic "${existing.name}" already exists.`
      const color = TOPIC_COLORS.includes(args.color as never)
        ? (args.color as Topic["color"])
        : TOPIC_COLORS[topics.length % TOPIC_COLORS.length]
      const position = Math.max(0, ...topics.map((t) => t.position)) + 1
      const icon = TOPIC_ICONS.includes(args.icon as never) ? (args.icon as Topic["icon"]) : "Circle"
      await applyOps(env, [{ t: "topic", id: crypto.randomUUID(), patch: { name, color, icon, position } }], now)
      return `Created topic "${name}".`
    }
  }
  throw new Error(`Unknown tool: ${name}`)
}

// ---------- JSON-RPC plumbing ----------

type RpcReq = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Json }

async function handleOne(msg: RpcReq, env: Env): Promise<Json | null> {
  const reply = (result: unknown) => ({ jsonrpc: "2.0", id: msg.id, result })
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: msg.id ?? null, error: { code, message } })
  if (msg.id === undefined) return null // notification

  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: (msg.params?.protocolVersion as string) ?? "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "smart-todo", version: "1.0.0" },
        instructions:
          "Personal todo list split into topics. Call get_overview first to learn today's date, time zone and topics. Dates you pass are in the user's local time zone.",
      })
    case "ping":
      return reply({})
    case "tools/list":
      return reply({ tools })
    case "tools/call": {
      const name = msg.params?.name as string
      const args = (msg.params?.arguments as Json) ?? {}
      try {
        const ctx = { env, tz: await getTimezone(env), now: Date.now() }
        const text = await callTool(name, args, ctx)
        return reply({ content: [{ type: "text", text }] })
      } catch (e) {
        return reply({ content: [{ type: "text", text: (e as Error).message }], isError: true })
      }
    }
    default:
      return fail(-32601, `Method not found: ${msg.method}`)
  }
}

export async function handleMcp(req: Request, env: Env): Promise<Response> {
  // Stateless server: no server-initiated stream (GET) and no sessions to end (DELETE).
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } })
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 })
  }
  const out = Array.isArray(body)
    ? (await Promise.all(body.map((m) => handleOne(m as RpcReq, env)))).filter(Boolean)
    : await handleOne(body as RpcReq, env)
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 })

  // Plain JSON unless the client only accepts a stream; then send it as a one-event SSE stream.
  const accept = req.headers.get("Accept") ?? ""
  if (accept.includes("text/event-stream") && !accept.includes("application/json") && !accept.includes("*/*")) {
    return new Response(`event: message\ndata: ${JSON.stringify(out)}\n\n`, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    })
  }
  return Response.json(out)
}

// Clippy, the in-app assistant (Claude Haiku). Two jobs, one response shape:
//  - "create": turn typed or dictated text into tasks (the app adds them right away)
//  - "brief":  look at the open list, say what's due / what matters, and suggest a few tasks to add

import Anthropic from "@anthropic-ai/sdk"

import { formatLocal, localParts, parseLocalDue } from "../shared/time"
import type { AiResponse, AiTask, Task, Topic } from "../shared/types"
import { type Env, getTimezone, rowToTask, rowToTopic } from "./db"

const MODEL = "claude-haiku-5-5"

const nullable = (type: string) => ({ anyOf: [{ type }, { type: "null" }] })

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["message", "tasks"],
  properties: {
    message: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "topic", "due", "important", "notes"],
        properties: {
          title: { type: "string" },
          topic: nullable("string"),
          due: nullable("string"),
          important: { type: "boolean" },
          notes: { type: "string" },
        },
      },
    },
  },
}

const SYSTEM = `You are Clippy, a cheerful paperclip living inside the user's personal todo app. Be brief, warm and a little playful, never cheesy or long.

Each task has: title (short, imperative, no date words in it), topic (exact name of one of the user's topics, or null), due (local "YYYY-MM-DD" for all-day, "YYYY-MM-DDTHH:mm" for a time, or null), important (true only if the user stresses urgency or it's a hard deadline), notes (usually "").

Resolve relative dates ("tomorrow", "friday", "next week", "tonight") against the current local date given. Pick a topic only when one clearly fits.`

const CREATE = `Turn the user's text (typed or dictated, so it may ramble or contain filler) into tasks. One sentence can hold several tasks. Don't duplicate tasks that are already open. "message" is one short sentence confirming what you added. If nothing in the text is a task, return no tasks and say so in "message".`

const BRIEF = `Give the user a quick heads-up about their list in "message" (at most 2 short sentences): call out what's overdue or due soon and anything that looks important, by name. If the list is in good shape, say so. Then put 0-3 genuinely useful suggested tasks in "tasks" (e.g. a prep step for a big deadline, an obvious follow-up). Never suggest something already on the list.`

function describeTask(t: Task, topics: Topic[], tz: string, now: number) {
  const parts = [`- ${t.title}`]
  const topic = topics.find((x) => x.id === t.topicId)
  if (topic) parts.push(`#${topic.name}`)
  if (t.dueAt !== null) {
    const overdue = (t.allDay ? t.dueAt + 86_400_000 : t.dueAt) < now
    parts.push(
      `due ${formatLocal(t.dueAt, t.allDay, tz)}${overdue ? " (OVERDUE)" : ""}`
    )
  }
  if (t.important) parts.push("[important]")
  return parts.join(" ")
}

export async function runAssistant(
  env: Env,
  mode: "create" | "brief",
  text: string
): Promise<AiResponse> {
  if (!env.ANTHROPIC_API_KEY)
    throw new AiError(
      "Clippy needs an ANTHROPIC_API_KEY secret on the Worker.",
      503
    )
  const now = Date.now()
  const [tz, topicRows, taskRows] = await Promise.all([
    getTimezone(env),
    env.DB.prepare(
      "SELECT * FROM topics WHERE deleted = 0 ORDER BY position"
    ).all<Record<string, unknown>>(),
    env.DB.prepare(
      "SELECT * FROM tasks WHERE deleted = 0 AND done_at IS NULL ORDER BY due_at IS NULL, due_at LIMIT 150"
    ).all<Record<string, unknown>>(),
  ])
  const topics = topicRows.results.map(rowToTopic)
  const tasks = taskRows.results.map(rowToTask)
  const p = localParts(now, tz)
  const pad = (n: number) => String(n).padStart(2, "0")
  const today = `${p.y}-${pad(p.m)}-${pad(p.d)}`
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
  }).format(now)

  const context = [
    `Now: ${weekday} ${today} ${pad(p.h)}:${pad(p.min)} (${tz})`,
    `Topics: ${topics.map((t) => t.name).join(", ") || "(none)"}`,
    `Open tasks:\n${tasks.map((t) => describeTask(t, topics, tz, now)).join("\n") || "(none)"}`,
  ].join("\n\n")

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: `${SYSTEM}\n\n${mode === "create" ? CREATE : BRIEF}`,
    messages: [
      {
        role: "user",
        content:
          mode === "create" ? `${context}\n\nUser said:\n${text}` : context,
      },
    ],
  })
  if (res.stop_reason === "refusal")
    return { message: "I can't help with that one.", tasks: [] }
  const out = res.content.find((b) => b.type === "text")
  if (!out || out.type !== "text")
    throw new AiError("No answer from Clippy", 502)
  const parsed = JSON.parse(out.text) as {
    message: string
    tasks: {
      title: string
      topic: string | null
      due: string | null
      important: boolean
      notes: string
    }[]
  }

  const byName = (name: string | null) =>
    name
      ? (topics.find((t) => t.name.toLowerCase() === name.trim().toLowerCase())
          ?.id ?? null)
      : null
  return {
    message: parsed.message,
    tasks: parsed.tasks
      .filter((t) => t.title.trim())
      .slice(0, 20)
      .map((t): AiTask => {
        const due = t.due ? parseLocalDue(t.due, tz) : null
        return {
          title: t.title.trim().slice(0, 500),
          topicId: byName(t.topic),
          dueAt: due?.dueAt ?? null,
          allDay: due?.allDay ?? false,
          important: !!t.important,
          notes: (t.notes ?? "").slice(0, 5000),
        }
      }),
  }
}

export class AiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message)
  }
}

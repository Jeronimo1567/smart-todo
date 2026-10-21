// Runs every minute from the cron trigger.
//
// Important tasks:  1 day, 3 h and 1 h before, at the due time, then every hour
//                   while overdue (all-day tasks: 6 PM the day before, 9 AM, 3 PM, then hourly the next day).
// Normal tasks:     once at the due time (all-day: 9 AM that day).
// Snoozed tasks:    once when the snooze ends.
// Nothing fires during quiet hours; a missed reminder fires once when they end.
// Morning digest:   7:30 AM local, push + email (if Resend is configured).

import { DAY, HOUR, MINUTE, effectiveDue, formatLocal, localDateKey, localParts, startOfLocalDay } from "../shared/time"
import { type Env, getSetting, getTimezone, rowToTask, rowToTopic, setSetting } from "./db"
import { pushAll } from "./push"
import type { Task } from "../shared/types"

const QUIET_START = 22 // 10 PM
const QUIET_END = 8 // 8 AM
const DIGEST_AT = { h: 7, min: 30 }

type Row = Record<string, unknown>

export function reminderPoints(t: Task): number[] {
  if (t.dueAt === null) return t.snoozedUntil ? [t.snoozedUntil] : []
  const due = t.dueAt
  const pts: number[] = []
  if (t.allDay) {
    pts.push(due + 9 * HOUR)
    if (t.important) pts.push(due - 6 * HOUR, due + 15 * HOUR)
  } else {
    pts.push(due)
    if (t.important) pts.push(due - DAY, due - 3 * HOUR, due - HOUR)
  }
  if (t.snoozedUntil) pts.push(t.snoozedUntil)
  return pts
}

/** Latest reminder moment at or before `now`, or null. */
export function latestPoint(t: Task, now: number): number | null {
  let best: number | null = null
  for (const p of reminderPoints(t)) if (p <= now && (best === null || p > best)) best = p
  if (t.important && t.dueAt !== null) {
    const eff = effectiveDue(t.dueAt, t.allDay)
    if (now >= eff + HOUR) {
      const p = eff + Math.floor((now - eff) / HOUR) * HOUR
      if (best === null || p > best) best = p
    }
  }
  return best
}

function relative(t: Task, now: number, tz: string) {
  const due = t.dueAt!
  const eff = effectiveDue(due, t.allDay)
  if (now >= eff) {
    const h = Math.round((now - eff) / HOUR)
    return h < 1 ? "Overdue" : h < 48 ? `Overdue by ${h}h` : `Overdue by ${Math.round(h / 24)} days`
  }
  if (t.allDay) {
    return startOfLocalDay(now, tz) === due ? "Due today" : `Due ${formatLocal(due, true, tz)}`
  }
  const mins = Math.round((due - now) / MINUTE)
  if (mins <= 1) return "Due now"
  if (mins < 90) return `Due in ${mins} min`
  if (mins < 36 * 60) return `Due in ${Math.round(mins / 60)}h · ${formatLocal(due, false, tz)}`
  return `Due ${formatLocal(due, false, tz)}`
}

export async function runReminders(env: Env, now = Date.now()) {
  const tz = await getTimezone(env)
  const local = localParts(now, tz)
  const quiet = local.h >= QUIET_START || local.h < QUIET_END

  await maybeDigest(env, now, tz, local)
  if (quiet) return

  const { results } = await env.DB.prepare(
    `SELECT * FROM tasks WHERE deleted = 0 AND done_at IS NULL
       AND ((due_at IS NOT NULL AND due_at <= ?) OR (snoozed_until IS NOT NULL AND snoozed_until <= ?))`
  )
    .bind(now + DAY + HOUR, now)
    .all<Row>()
  if (!results.length) return

  const topicIds = [...new Set(results.map((r) => r.topic_id).filter(Boolean))] as string[]
  const topics = topicIds.length
    ? (
        await env.DB.prepare(`SELECT * FROM topics WHERE id IN (${topicIds.map(() => "?").join(",")})`)
          .bind(...topicIds)
          .all<Row>()
      ).results.map(rowToTopic)
    : []
  const topicName = Object.fromEntries(topics.map((t) => [t.id, t.name]))

  const nagged: string[] = []
  for (const r of results) {
    const t = rowToTask(r)
    if (t.snoozedUntil && t.snoozedUntil > now) continue
    const p = latestPoint(t, now)
    const since = Math.max((r.last_nagged_at as number) ?? 0, t.createdAt)
    if (p === null || p <= since) continue
    const where = t.topicId ? topicName[t.topicId] : null
    const when = t.dueAt !== null ? relative(t, now, tz) : "Snooze over"
    await pushAll(env, {
      title: t.important ? `❗ ${t.title}` : t.title,
      body: where ? `${when} · ${where}` : when,
      tag: `task-${t.id}`,
      taskId: t.id,
    })
    nagged.push(t.id)
  }
  if (nagged.length) {
    await env.DB.batch(
      nagged.map((id) => env.DB.prepare("UPDATE tasks SET last_nagged_at = ? WHERE id = ?").bind(now, id))
    )
  }
}

async function maybeDigest(env: Env, now: number, tz: string, local: { h: number; min: number }) {
  if (local.h * 60 + local.min < DIGEST_AT.h * 60 + DIGEST_AT.min) return
  const today = localDateKey(now, tz)
  if ((await getSetting(env, "last_digest")) === today) return
  await setSetting(env, "last_digest", today)

  const endOfToday = startOfLocalDay(now, tz) + DAY
  const { results } = await env.DB.prepare(
    `SELECT * FROM tasks WHERE deleted = 0 AND done_at IS NULL AND due_at IS NOT NULL AND due_at < ? ORDER BY due_at`
  )
    .bind(endOfToday)
    .all<Row>()
  const tasks = results.map(rowToTask)
  const overdue = tasks.filter((t) => effectiveDue(t.dueAt!, t.allDay) <= now)
  const dueToday = tasks.filter((t) => !overdue.includes(t))

  // Housekeeping: forget soft-deleted rows after 30 days.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM tasks WHERE deleted = 1 AND updated_at < ?").bind(now - 30 * DAY),
    env.DB.prepare("DELETE FROM topics WHERE deleted = 1 AND updated_at < ?").bind(now - 30 * DAY),
  ])

  if (!tasks.length) return
  const parts = [dueToday.length && `${dueToday.length} due today`, overdue.length && `${overdue.length} overdue`]
  const summary = parts.filter(Boolean).join(" · ")
  await pushAll(env, {
    title: `Today: ${summary}`,
    body: [...overdue, ...dueToday]
      .slice(0, 4)
      .map((t) => (t.important ? `❗ ${t.title}` : t.title))
      .join("\n"),
    tag: "digest",
  })
  await sendDigestEmail(env, summary, overdue, dueToday, tz)
}

async function sendDigestEmail(env: Env, summary: string, overdue: Task[], today: Task[], tz: string) {
  if (!env.RESEND_API_KEY || !env.DIGEST_EMAIL) return
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)
  const li = (t: Task) =>
    `<li>${t.important ? "❗ " : ""}${esc(t.title)} <span style="color:#888">— ${formatLocal(t.dueAt!, t.allDay, tz)}</span></li>`
  const section = (label: string, list: Task[]) => (list.length ? `<h3>${label}</h3><ul>${list.map(li).join("")}</ul>` : "")
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: "MCP Todo <onboarding@resend.dev>",
      to: [env.DIGEST_EMAIL],
      subject: `Today: ${summary}`,
      html: `<div style="font-family:system-ui,sans-serif">${section("Overdue", overdue)}${section("Due today", today)}</div>`,
    }),
  })
  if (!res.ok) console.warn("digest email failed", res.status, await res.text())
}

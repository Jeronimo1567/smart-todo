import type { Task, TopicColor } from "@/shared/types"

export const DAY = 86_400_000

// Static class names so Tailwind keeps them.
export const DOT: Record<TopicColor, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  emerald: "bg-emerald-500",
  violet: "bg-violet-500",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  lime: "bg-lime-500",
  indigo: "bg-indigo-500",
  pink: "bg-pink-500",
  slate: "bg-slate-400",
}

export const TEXT: Record<TopicColor, string> = {
  sky: "text-sky-500",
  amber: "text-amber-500",
  emerald: "text-emerald-500",
  violet: "text-violet-500",
  rose: "text-rose-500",
  orange: "text-orange-500",
  teal: "text-teal-500",
  blue: "text-blue-500",
  lime: "text-lime-500",
  indigo: "text-indigo-500",
  pink: "text-pink-500",
  slate: "text-slate-400",
}

export function startOfToday(now = Date.now()) {
  const d = new Date(now)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function dayOffset(ts: number, now = Date.now()) {
  const d = new Date(ts)
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((day - startOfToday(now)) / DAY)
}

export function isOverdue(t: Task, now = Date.now()) {
  if (t.dueAt === null || t.doneAt) return false
  return t.allDay ? dayOffset(t.dueAt, now) < 0 : t.dueAt <= now
}

export type Tone = "overdue" | "today" | "soon" | "later"

export function dueTone(t: Task, now = Date.now()): Tone {
  if (isOverdue(t, now)) return "overdue"
  const off = dayOffset(t.dueAt!, now)
  return off === 0 ? "today" : off < 7 ? "soon" : "later"
}

export function dayLabel(ts: number, now = Date.now()) {
  const off = dayOffset(ts, now)
  if (off === 0) return "Today"
  if (off === 1) return "Tomorrow"
  if (off === -1) return "Yesterday"
  const d = new Date(ts)
  if (off > 1 && off < 7) return d.toLocaleDateString(undefined, { weekday: "short" })
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}),
  })
}

export function timeLabel(ts: number) {
  const d = new Date(ts)
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: d.getMinutes() ? "2-digit" : undefined })
}

export function dueLabel(t: Pick<Task, "dueAt" | "allDay">, now = Date.now()) {
  if (t.dueAt === null) return ""
  return t.allDay ? dayLabel(t.dueAt, now) : `${dayLabel(t.dueAt, now)} ${timeLabel(t.dueAt)}`
}

/** Open tasks: earliest due first, important first on ties, undated last. */
export function byDue(a: Task, b: Task) {
  const ad = a.dueAt ?? Infinity
  const bd = b.dueAt ?? Infinity
  if (ad !== bd) return ad - bd
  if (a.important !== b.important) return a.important ? -1 : 1
  return a.createdAt - b.createdAt
}

// <input type="date"> / <input type="time"> helpers (local time)
const pad = (n: number) => String(n).padStart(2, "0")
export function toDateInput(ts: number | null) {
  if (ts === null) return ""
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
export function toTimeInput(ts: number | null, allDay: boolean) {
  if (ts === null || allDay) return ""
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
export function fromInputs(date: string, time: string): { dueAt: number | null; allDay: boolean } {
  if (!date) return { dueAt: null, allDay: false }
  const [y, m, d] = date.split("-").map(Number)
  if (!time) return { dueAt: new Date(y, m - 1, d).getTime(), allDay: true }
  const [h, mi] = time.split(":").map(Number)
  return { dueAt: new Date(y, m - 1, d, h, mi).getTime(), allDay: false }
}

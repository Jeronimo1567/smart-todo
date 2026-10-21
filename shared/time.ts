// Time-zone helpers with no dependencies (Intl only). Used by the Worker,
// which runs in UTC, to reason about the user's local wall-clock time.

const HOUR = 3_600_000
export const MINUTE = 60_000
export { HOUR }
export const DAY = 24 * HOUR

const fmtCache = new Map<string, Intl.DateTimeFormat>()
function fmt(tz: string) {
  let f = fmtCache.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
    fmtCache.set(tz, f)
  }
  return f
}

export type LocalParts = { y: number; m: number; d: number; h: number; min: number }

export function localParts(ts: number, tz: string): LocalParts {
  const p: Record<string, number> = {}
  for (const { type, value } of fmt(tz).formatToParts(new Date(ts))) {
    if (type !== "literal") p[type] = Number(value)
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour, min: p.minute }
}

function offset(ts: number, tz: string) {
  const p = localParts(ts, tz)
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.min)
  return asUtc - Math.floor(ts / MINUTE) * MINUTE
}

/** Convert a wall-clock time in `tz` to a UTC timestamp. */
export function zonedToUtc(y: number, m: number, d: number, h: number, min: number, tz: string) {
  const guess = Date.UTC(y, m - 1, d, h, min)
  const first = guess - offset(guess, tz)
  return guess - offset(first, tz)
}

export function startOfLocalDay(ts: number, tz: string) {
  const p = localParts(ts, tz)
  return zonedToUtc(p.y, p.m, p.d, 0, 0, tz)
}

export function localDateKey(ts: number, tz: string) {
  const p = localParts(ts, tz)
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`
}

/** "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm" (local to tz) -> { dueAt, allDay } */
export function parseLocalDue(input: string, tz: string): { dueAt: number; allDay: boolean } | null {
  const m = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/)
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  if (h === undefined) return { dueAt: zonedToUtc(+y, +mo, +d, 0, 0, tz), allDay: true }
  return { dueAt: zonedToUtc(+y, +mo, +d, +h, +mi, tz), allDay: false }
}

/** Human label for a due time in tz, e.g. "Tue Oct 21, 5:00 PM" or "Tue Oct 21". */
export function formatLocal(ts: number, allDay: boolean, tz: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { hour: "numeric", minute: "2-digit" }),
  }).format(new Date(ts))
}

/** When an all-day task stops being "on time". */
export function effectiveDue(dueAt: number, allDay: boolean) {
  return allDay ? dueAt + DAY : dueAt
}

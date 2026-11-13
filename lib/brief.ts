"use client"

// The prose "Today" brief. Local-first like everything else: a brief written on the device shows
// instantly, then Claude's wording (POST /api/brief) replaces it when it arrives. Claude's version
// is cached per task snapshot so reopening the app doesn't ask again.

import { useEffect, useMemo, useState } from "react"

import { DAY, byDue, dayOffset, isOverdue, startOfToday, timeLabel } from "@/lib/format"
import type { Brief, BriefItem, BriefRequest, Task, Topic } from "@/shared/types"

const CACHE_KEY = "todo:brief:v1"

export function partOfDay(now: number): BriefRequest["partOfDay"] {
  const h = new Date(now).getHours()
  return h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening"
}

/** "today 3 PM", "tomorrow", "Friday", "2 days ago" */
function when(t: Task, now: number) {
  const off = dayOffset(t.dueAt!, now)
  const day =
    off === 0
      ? "today"
      : off === 1
        ? "tomorrow"
        : off === -1
          ? "yesterday"
          : off < 0
            ? `${-off} days ago`
            : new Date(t.dueAt!).toLocaleDateString(undefined, { weekday: "long" })
  return t.allDay ? day : `${day} ${timeLabel(t.dueAt!)}`
}

export function briefRequest(open: Task[], all: Task[], topics: Record<string, Topic>, now: number): BriefRequest {
  const todayEnd = startOfToday(now) + DAY
  const item = (t: Task): BriefItem => ({
    title: t.title,
    due: when(t, now),
    ...(t.topicId && topics[t.topicId] ? { topic: topics[t.topicId].name } : {}),
    ...(t.important ? { important: true } : {}),
    ...(t.notes ? { notes: t.notes.slice(0, 200) } : {}),
  })
  const sorted = open.slice().sort(byDue)
  const overdue = sorted.filter((t) => isOverdue(t, now))
  const today = sorted.filter((t) => t.dueAt !== null && t.dueAt < todayEnd && !isOverdue(t, now))
  const upcoming = sorted.filter((t) => t.dueAt !== null && t.dueAt >= todayEnd && t.dueAt < todayEnd + 7 * DAY)
  return {
    date: new Date(now).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }),
    partOfDay: partOfDay(now),
    overdue: overdue.slice(0, 10).map(item),
    today: today.slice(0, 15).map(item),
    upcoming: upcoming.slice(0, 10).map(item),
    counts: {
      overdue: overdue.length,
      today: today.length,
      upcoming: upcoming.length,
      undated: open.filter((t) => t.dueAt === null).length,
      doneToday: all.filter((t) => t.doneAt && t.doneAt >= startOfToday(now)).length,
    },
  }
}

const b = (s: string) => `**${s}**`
/** "a", "a and b", "a, b and c", "a, b and 3 more" */
function names(list: BriefItem[], total: number) {
  const shown = list.slice(0, total > 3 ? 2 : 3).map((i) => b(i.title))
  const rest = total - shown.length
  if (rest > 0) return `${shown.join(", ")} and ${rest} more`
  return shown.length > 1 ? `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}` : (shown[0] ?? "")
}

/** The on-device wording: plainer than Claude's, but instant and works offline. */
export function localBrief(r: BriefRequest): Brief {
  const { counts: c } = r
  const paragraphs: string[] = []
  if (c.overdue) paragraphs.push(`${names(r.overdue, c.overdue)} ${c.overdue === 1 ? "is" : "are"} **overdue**.`)
  if (c.today) paragraphs.push(`On your plan for **today**: ${names(r.today, c.today)}.`)
  else if (c.overdue) paragraphs.push("Nothing else is due **today**.")
  const tomorrow = r.upcoming.filter((i) => i.due.startsWith("tomorrow"))
  const later = r.upcoming.filter((i) => !i.due.startsWith("tomorrow"))
  if (tomorrow.length) {
    paragraphs.push(`Coming up **tomorrow**: ${names(tomorrow, tomorrow.length)}.`)
  }
  if (later.length) {
    const laterTotal = c.upcoming - tomorrow.length
    paragraphs.push(
      laterTotal === 1
        ? `Later this week: ${b(later[0].title)}, due ${b(later[0].due)}.`
        : `Later this week: ${names(later, laterTotal)}, starting ${b(later[0].due)}.`
    )
  }
  if (!paragraphs.length) {
    paragraphs.push(
      c.doneToday
        ? "Everything for **today** is done, and nothing is coming up this week."
        : "Nothing is due **today** or in the next few days."
    )
  }
  const important = r.today.some((i) => i.important)
  const status = c.overdue
    ? c.overdue === 1
      ? "One thing needs your attention."
      : "A few things need your attention."
    : important
      ? "One important thing today, the rest can wait."
      : c.today
        ? "Nothing urgent today, you're in a good place."
        : "Your day is clear."
  const closing =
    r.partOfDay === "evening" ? "That's it. Enjoy your evening!" : `That's it. Have a nice ${r.partOfDay === "morning" ? "day" : "afternoon"}!`
  return { status, paragraphs, closing }
}

export function briefToSpeech(greeting: string, brief: Brief) {
  return [greeting + ".", brief.status, ...brief.paragraphs, brief.closing].join(" ").replace(/\*\*/g, "")
}

type Cached = { key: string; brief: Brief }
function readCache(key: string): Brief | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as Cached | null
    return c?.key === key ? c.brief : null
  } catch {
    return null
  }
}

// Once the server says there is no API key, stop asking until the next app start.
let unavailable = false

/** The brief to show now. `written` is Claude's version when we have it for this exact snapshot. */
export function useBrief(request: BriefRequest, enabled: boolean) {
  const key = useMemo(() => JSON.stringify(request), [request])
  const local = useMemo(() => localBrief(request), [request])
  const [written, setWritten] = useState<Cached | null>(null)

  useEffect(() => {
    if (!enabled || unavailable) return
    const cached = readCache(key)
    const ctrl = new AbortController()
    // Wait for a pause in edits (ticking off a few tasks) before asking.
    const timer = setTimeout(
      async () => {
        if (cached) return setWritten({ key, brief: cached })
        try {
          const res = await fetch("/api/brief", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: key,
            signal: ctrl.signal,
          })
          if (res.status === 503) unavailable = true
          if (!res.ok) return
          const { brief } = (await res.json()) as { brief: Brief }
          setWritten({ key, brief })
          try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ key, brief }))
          } catch {}
        } catch {
          // offline or aborted: the local brief stays
        }
      },
      cached ? 0 : 1500
    )
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [key, enabled])

  return written?.key === key ? written.brief : local
}

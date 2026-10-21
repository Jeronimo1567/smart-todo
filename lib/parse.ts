// Natural-language quick add, e.g.
//   "dentist fri 4pm !"              -> Fri 16:00, important
//   "report #personal oct 30"        -> Personal, Oct 30 (all day)
//   "call mom tomorrow at 7:30pm"    -> tomorrow 19:30
//   "renew license in 2 weeks !!"    -> +14 days, important
// Runs in the browser, so plain Date = the user's local time.

import type { Topic } from "@/shared/types"

export type Parsed = {
  title: string
  dueAt: number | null
  allDay: boolean
  important: boolean
  topicId: string | null
}

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]

const WD = "(sun(?:day)?|mon(?:day)?|tue(?:s(?:day)?)?|wed(?:nesday)?|thu(?:r(?:s(?:day)?)?)?|fri(?:day)?|sat(?:urday)?)"
const MO = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
const PRE = "(?:(?:on|by|due|for)\\s+)?"

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}
/** Pick this year's date, or next year's if it already passed. */
function upcoming(month: number, day: number, today: Date) {
  const d = new Date(today.getFullYear(), month, day)
  return d < today ? new Date(today.getFullYear() + 1, month, day) : d
}

export function parseQuickAdd(input: string, topics: Topic[], now = new Date()): Parsed {
  let s = ` ${input} `
  let important = false
  let topicId: string | null = null
  let day: Date | null = null
  let time: { h: number; m: number } | null = null
  const today = startOfDay(now)

  const take = (re: RegExp, fn: (m: RegExpMatchArray) => boolean | void) => {
    const m = s.match(re)
    if (m && fn(m) !== false) s = s.replace(m[0], " ")
  }

  // Importance: "!" / "!!" as a word or at the end
  take(/\s!{1,3}(?=\s)/, () => void (important = true))
  take(/!+\s*$/, () => void (important = true))

  // Topic: #word (matches topic name without spaces, prefix ok)
  take(/\s#([\p{L}\p{N}_-]+)(?=\s)/u, (m) => {
    const q = m[1].toLowerCase()
    const t =
      topics.find((t) => t.name.toLowerCase().replace(/\s+/g, "") === q) ??
      topics.find((t) => t.name.toLowerCase().replace(/\s+/g, "").startsWith(q))
    if (!t) return false
    topicId = t.id
  })

  // Time: "at 5pm", "5:30pm", "17:00", "noon", "tonight"
  take(/\s(?:at\s+)?(noon|midnight)(?=\s)/i, (m) => void (time = { h: m[1].toLowerCase() === "noon" ? 12 : 0, m: 0 }))
  if (!time)
    take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)(?=\s)/i, (m) => {
      let h = +m[1] % 12
      if (m[3].toLowerCase().startsWith("p")) h += 12
      time = { h, m: +(m[2] ?? 0) }
    })
  if (!time)
    take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => void (time = { h: +m[1], m: +m[2] }))
  if (!time)
    take(/\sat\s+(\d{1,2})(?=\s)/i, (m) => {
      const h = +m[1]
      if (h < 1 || h > 12) return false
      time = { h: h <= 7 ? h + 12 : h, m: 0 } // "at 5" / "at 7" mean PM
    })

  // Day
  take(new RegExp(`\\s${PRE}(today|tod|tonight)(?=\\s)`, "i"), (m) => {
    day = today
    if (m[1].toLowerCase() === "tonight" && !time) time = { h: 20, m: 0 }
  })
  if (!day) take(new RegExp(`\\s${PRE}(tomorrow|tmrw|tmr|tom)(?=\\s)`, "i"), () => void (day = addDays(today, 1)))
  if (!day)
    take(/\sin\s+(\d+|a|an|one|two|three)\s+(day|week|month)s?(?=\s)/i, (m) => {
      const n = { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[1].toLowerCase()] ?? +m[1]
      const unit = m[2].toLowerCase()
      day = unit === "day" ? addDays(today, n) : unit === "week" ? addDays(today, 7 * n) : new Date(today.getFullYear(), today.getMonth() + n, today.getDate())
    })
  if (!day)
    take(new RegExp(`\\s${PRE}(next\\s+)?${WD}(?=\\s)`, "i"), (m) => {
      const target = WEEKDAYS.indexOf(m[2].slice(0, 3).toLowerCase())
      let diff = (target - today.getDay() + 7) % 7
      if (diff === 0) diff = 7 // "fri" on a Friday means next Friday
      day = addDays(today, diff)
    })
  if (!day)
    take(new RegExp(`\\s${PRE}${MO}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?(?=\\s)`, "i"), (m) => {
      const mo = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase())
      day = m[3] ? new Date(+m[3], mo, +m[2]) : upcoming(mo, +m[2], today)
    })
  if (!day)
    take(new RegExp(`\\s${PRE}(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MO}(?=\\s)`, "i"), (m) => {
      day = upcoming(MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()), +m[1], today)
    })
  if (!day)
    take(new RegExp(`\\s${PRE}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?(?=\\s)`), (m) => {
      const mo = +m[1] - 1
      const d = +m[2]
      if (mo > 11 || d < 1 || d > 31) return false
      day = m[3] ? new Date(+m[3] < 100 ? 2000 + +m[3] : +m[3], mo, d) : upcoming(mo, d, today)
    })

  let dueAt: number | null = null
  let allDay = false
  const t = time as { h: number; m: number } | null
  const d = day as Date | null
  if (d && t) dueAt = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m).getTime()
  else if (d) {
    dueAt = d.getTime()
    allDay = true
  } else if (t) {
    // Time only: today if still ahead, otherwise tomorrow
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), t.h, t.m)
    if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1)
    dueAt = at.getTime()
  }

  const title = s.replace(/\s+/g, " ").replace(/\s+(on|by|due|at)$/i, "").trim()
  return { title: title || input.trim(), dueAt, allDay, important, topicId }
}

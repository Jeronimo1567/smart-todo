"use client"

// Clippy: a floating paperclip that turns typed or spoken words into tasks (Claude Haiku via /api/ai),
// and pops up on its own to point out what's overdue, due soon or important, with a few suggestions.

import {
  ArrowUpIcon,
  Loader2Icon,
  MicIcon,
  PlusIcon,
  SquareIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { haptic } from "@/lib/haptics"
import { dueLabel, isOverdue, startOfToday, DAY } from "@/lib/format"
import { addTask, saveTask } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { AiResponse, AiTask, Task, Topic } from "@/shared/types"

import { TopicGlyph } from "./topic-icon"

const BRIEF_KEY = "todo:clippy:brief"
const BRIEF_EVERY = 3 * 3_600_000 // proactive check-in at most every 3 hours
const DISMISS_KEY = "todo:clippy:dismissed"

/** Original paperclip-with-eyes mascot. `look` nudges the pupils (e.g. toward the bubble). */
export function ClippyIcon({
  className,
  look = 0,
}: {
  className?: string
  look?: number
}) {
  return (
    <svg viewBox="0 0 64 96" className={className} aria-hidden>
      {/* wire: outer loop, inner loop */}
      <path
        d="M22 70 V24 a10 10 0 0 1 20 0 V76 a13 13 0 0 1 -26 0 V58"
        fill="none"
        stroke="#a1a1aa"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M32 52 V70"
        fill="none"
        stroke="#a1a1aa"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* brows */}
      <path
        d="M6 22 q9 -9 19 -3"
        fill="none"
        stroke="#18181b"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M38 18 q11 -5 19 5"
        fill="none"
        stroke="#18181b"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* eyes */}
      <ellipse
        cx="16"
        cy="37"
        rx="12"
        ry="10"
        fill="#f5f3ea"
        stroke="#c9c5b8"
        strokeWidth="1.2"
      />
      <ellipse
        cx="48"
        cy="35"
        rx="12"
        ry="10"
        fill="#f5f3ea"
        stroke="#c9c5b8"
        strokeWidth="1.2"
      />
      <ellipse cx={17 + look * 2} cy="38" rx="6" ry="5" fill="#18181b" />
      <ellipse cx={49 + look * 2} cy="36" rx="6" ry="5" fill="#18181b" />
    </svg>
  )
}

// Minimal Web Speech API types (not in every TS DOM lib).
type Recognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  start(): void
  stop(): void
  onresult:
    | ((e: {
        resultIndex: number
        results: ArrayLike<
          ArrayLike<{ transcript: string }> & { isFinal: boolean }
        >
      }) => void)
    | null
  onend: (() => void) | null
  onerror: ((e: { error: string }) => void) | null
}
function speechCtor(): (new () => Recognition) | null {
  if (typeof window === "undefined") return null
  const w = window as unknown as {
    SpeechRecognition?: new () => Recognition
    webkitSpeechRecognition?: new () => Recognition
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

async function ask(mode: "create" | "brief", text = ""): Promise<AiResponse> {
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, text }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok)
    throw new Error(data.error ?? "Clippy is having a moment. Try again.")
  return data as AiResponse
}

/** Instant, offline heads-up from the local list (used until / unless the AI brief arrives). */
function localBrief(open: Task[], now: number): string | null {
  const overdue = open.filter((t) => isOverdue(t, now))
  const soon = open.filter(
    (t) =>
      !overdue.includes(t) &&
      t.dueAt !== null &&
      t.dueAt < startOfToday(now) + DAY
  )
  const urgent = [...overdue, ...soon].filter((t) => t.important)
  if (!overdue.length && !soon.length) return null
  const parts: string[] = []
  const n = (k: number) => (k === 1 ? "1 task" : `${k} tasks`)
  if (overdue.length) parts.push(`${n(overdue.length)} overdue`)
  if (soon.length) parts.push(`${n(soon.length)} due today`)
  const lead = urgent[0] ? ` “${urgent[0].title}” looks important.` : ""
  return `It looks like you have ${parts.join(" and ")}.${lead}`
}

type Brief = { at: number; message: string; tasks: AiTask[] }
function readBrief(): Brief | null {
  try {
    return JSON.parse(localStorage.getItem(BRIEF_KEY) ?? "null")
  } catch {
    return null
  }
}

function TaskChip({ task, topics }: { task: AiTask; topics: Topic[] }) {
  const topic = task.topicId
    ? topics.find((t) => t.id === task.topicId)
    : undefined
  if (!topic && task.dueAt === null && !task.important) return null
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
      {topic && (
        <span className="flex items-center gap-1">
          <TopicGlyph topic={topic} className="size-3" />
          {topic.name}
        </span>
      )}
      {task.dueAt !== null && <span>{dueLabel(task)}</span>}
      {task.important && (
        <span className="text-amber-600 dark:text-amber-400">important</span>
      )}
    </span>
  )
}

type Props = { open: Task[]; topics: Topic[]; now: number; enabled: boolean }

export function Clippy({ open: openTasks, topics, now, enabled }: Props) {
  const [panel, setPanel] = useState(false)
  const [bubble, setBubble] = useState<string | null>(null)
  const [brief, setBrief] = useState<Brief | null>(null)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [added, setAdded] = useState<{
    message: string
    ids: string[]
    tasks: AiTask[]
  } | null>(null)
  const [listening, setListening] = useState(false)
  const recRef = useRef<Recognition | null>(null)
  const baseRef = useRef("") // text typed before dictation started
  const canSpeak = useMemo(() => !!speechCtor(), [])

  const local = useMemo(() => localBrief(openTasks, now), [openTasks, now])

  // Proactive check-in: on open (and every few hours), say what needs attention.
  const refreshBrief = useCallback(async () => {
    const cached = readBrief()
    if (cached) setBrief(cached)
    if (cached && Date.now() - cached.at < BRIEF_EVERY) return cached
    try {
      const res = await ask("brief")
      const next = { at: Date.now(), ...res }
      localStorage.setItem(BRIEF_KEY, JSON.stringify(next))
      setBrief(next)
      return next
    } catch {
      return cached
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    const t = setTimeout(async () => {
      const b = await refreshBrief()
      if (cancelled) return
      const message = b?.message ?? local
      if (!message) return
      // Don't repeat the exact same pop-up after it was dismissed.
      if (localStorage.getItem(DISMISS_KEY) === message) return
      setBubble(message)
    }, 1500)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
    // Run once per session, not on every list change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  const stopListening = useCallback(() => {
    recRef.current?.stop()
    recRef.current = null
    setListening(false)
  }, [])

  function startListening() {
    const Ctor = speechCtor()
    if (!Ctor) return
    haptic("light")
    setError(null)
    const rec = new Ctor()
    rec.lang = navigator.language || "en-US"
    rec.continuous = true
    rec.interimResults = true
    baseRef.current = text.trim() ? text.trim() + " " : ""
    rec.onresult = (e) => {
      let said = ""
      for (let i = 0; i < e.results.length; i++)
        said += e.results[i][0].transcript
      setText(baseRef.current + said)
    }
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setError("Microphone access was blocked.")
      setListening(false)
    }
    rec.onend = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  useEffect(() => () => recRef.current?.stop(), [])

  async function submit() {
    const input = text.trim()
    if (!input || busy) return
    stopListening()
    setBusy(true)
    setError(null)
    try {
      const res = await ask("create", input)
      const ids = res.tasks.map((t) => addTask({ ...t }))
      haptic(ids.length ? "success" : "light")
      setAdded({ message: res.message, ids, tasks: res.tasks })
      setText("")
    } catch (e) {
      haptic("error")
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  function undo() {
    if (!added) return
    haptic("warning")
    for (const id of added.ids) saveTask(id, { deleted: true })
    setAdded(null)
  }

  function addSuggestion(t: AiTask) {
    haptic("success")
    addTask({ ...t })
    setBrief((b) => {
      if (!b) return b
      const next = { ...b, tasks: b.tasks.filter((x) => x !== t) }
      localStorage.setItem(BRIEF_KEY, JSON.stringify(next))
      return next
    })
  }

  function openPanel() {
    haptic("selection")
    setBubble(null)
    setPanel(true)
    void refreshBrief()
  }

  function dismissBubble() {
    if (bubble) localStorage.setItem(DISMISS_KEY, bubble)
    setBubble(null)
  }

  if (!enabled) return null
  const headline =
    brief?.message ??
    local ??
    "Hi! Tell me what you need to do and I'll turn it into tasks."

  return (
    <div className="pointer-events-none fixed right-4 bottom-[max(env(safe-area-inset-bottom),1rem)] z-40 flex flex-col items-end gap-2 md:right-6 md:bottom-6">
      {panel && (
        <div className="pointer-events-auto flex max-h-[min(36rem,calc(100dvh-8rem))] w-[min(24rem,calc(100vw-2rem))] animate-in flex-col overflow-hidden rounded-2xl bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10 duration-150 fade-in-0 slide-in-from-bottom-2">
          <div className="flex items-start gap-3 p-3">
            <ClippyIcon className="h-14 w-10 shrink-0" look={1} />
            <p className="min-w-0 flex-1 pt-1 text-sm">{headline}</p>
            <button
              onClick={() => {
                stopListening()
                setPanel(false)
              }}
              className="-m-1 rounded-md p-2 text-muted-foreground hover:text-foreground"
              aria-label="Close Clippy"
            >
              <XIcon className="size-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 empty:hidden">
            {added && (
              <div className="mb-3 rounded-lg bg-muted/60 p-2.5 last:mb-0">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm">{added.message}</p>
                  {added.ids.length > 0 && (
                    <button
                      onClick={undo}
                      className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <Undo2Icon className="size-3.5" /> Undo
                    </button>
                  )}
                </div>
                {added.tasks.map((t, i) => (
                  <div
                    key={i}
                    className="mt-1.5 border-l-2 border-primary/40 pl-2"
                  >
                    <p className="text-sm font-medium">{t.title}</p>
                    <TaskChip task={t} topics={topics} />
                  </div>
                ))}
              </div>
            )}

            {!!brief?.tasks.length && (
              <div>
                <h3 className="pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Suggestions
                </h3>
                {brief.tasks.map((t, i) => (
                  <button
                    key={i}
                    onClick={() => addSuggestion(t)}
                    className="flex w-full items-start gap-2 rounded-lg px-1.5 py-2 text-left hover:bg-muted active:bg-muted"
                  >
                    <PlusIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">
                      <span className="block text-sm">{t.title}</span>
                      <TaskChip task={t} topics={topics} />
                    </span>
                  </button>
                ))}
              </div>
            )}
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            className="flex items-end gap-2 border-t p-2"
          >
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void submit()
                }
              }}
              rows={1}
              placeholder={
                listening
                  ? "Listening…"
                  : "e.g. call mom tomorrow, essay due fri 5pm"
              }
              className="field-sizing-content max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-base outline-none placeholder:text-muted-foreground md:text-sm"
              aria-label="Tell Clippy what to add"
            />
            {canSpeak && (
              <button
                type="button"
                onClick={() => (listening ? stopListening() : startListening())}
                className={cn(
                  "flex size-10 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground",
                  listening &&
                    "animate-pulse bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                )}
                aria-label={listening ? "Stop dictation" : "Dictate"}
              >
                {listening ? (
                  <SquareIcon className="size-4 fill-current" />
                ) : (
                  <MicIcon className="size-5" />
                )}
              </button>
            )}
            <button
              type="submit"
              disabled={!text.trim() || busy}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
              aria-label="Add tasks"
            >
              {busy ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <ArrowUpIcon className="size-5" />
              )}
            </button>
          </form>
        </div>
      )}

      {!panel && bubble && (
        <div className="pointer-events-auto relative mr-2 max-w-[min(18rem,calc(100vw-6rem))] animate-in rounded-2xl bg-[#fffbd6] px-3.5 py-2.5 pr-8 text-sm text-zinc-900 shadow-lg ring-1 ring-black/10 duration-200 fade-in-0 zoom-in-95 slide-in-from-bottom-2">
          <button onClick={openPanel} className="text-left">
            {bubble}
          </button>
          <button
            onClick={dismissBubble}
            className="absolute top-1.5 right-1.5 rounded p-1 text-zinc-500 hover:text-zinc-900"
            aria-label="Dismiss"
          >
            <XIcon className="size-3.5" />
          </button>
          <span className="absolute right-5 -bottom-1.5 size-3 rotate-45 bg-[#fffbd6] ring-1 ring-black/10 [clip-path:polygon(100%_0,100%_100%,0_100%)]" />
        </div>
      )}

      {!panel && (
        <button
          onClick={openPanel}
          className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-background shadow-lg ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5 active:scale-95"
          aria-label="Ask Clippy"
        >
          <ClippyIcon
            className={cn(
              "h-12 w-9",
              bubble && "animate-bounce [animation-iteration-count:2]"
            )}
            look={bubble ? -1 : 0}
          />
        </button>
      )}
    </div>
  )
}

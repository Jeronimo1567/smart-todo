"use client"

import {
  BellOffIcon,
  BellRingIcon,
  CalendarIcon,
  InboxIcon,
  ListTodoIcon,
  MoonIcon,
  PlusIcon,
  SunIcon,
  SunMediumIcon,
} from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { DOT } from "@/lib/format"
import { type PushState, disablePush, enablePush, getPushState } from "@/lib/push"
import { saveTopic } from "@/lib/store"
import { cn } from "@/lib/utils"
import { TOPIC_COLORS, type Topic } from "@/shared/types"

export type View = "today" | "upcoming" | "all" | `topic:${string}`

export function Sidebar({
  view,
  onSelect,
  topics,
  counts,
}: {
  view: View
  onSelect: (v: View) => void
  topics: Topic[]
  counts: { today: number; overdue: number; byTopic: Record<string, number> }
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const handled = useRef(false) // Enter and the following blur both fire

  function addTopic(e: React.FormEvent) {
    e.preventDefault()
    if (handled.current) return
    handled.current = true
    const n = name.trim()
    setAdding(false)
    setName("")
    if (!n) return
    const id = crypto.randomUUID()
    saveTopic(id, {
      name: n,
      color: TOPIC_COLORS[topics.length % TOPIC_COLORS.length],
      position: Math.max(0, ...topics.map((t) => t.position)) + 1,
    })
    onSelect(`topic:${id}`)
  }

  const item = (v: View, icon: React.ReactNode, label: string, count?: number, alert?: boolean) => (
    <button
      key={v}
      onClick={() => onSelect(v)}
      className={cn(
        "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        view === v && "bg-muted font-medium text-foreground"
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count ? (
        <span className={cn("ml-auto text-xs tabular-nums", alert ? "font-medium text-destructive" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <div className="flex h-full flex-col gap-0.5 p-3">
      <div className="mb-3 flex items-center gap-2 px-2.5 pt-1 text-sm font-semibold">
        <ListTodoIcon className="size-4 shrink-0" />
        <span className="truncate">MCP Enabled Todo List</span>
      </div>
      {item("today", <SunIcon className="size-4" />, "Today", counts.today, counts.overdue > 0)}
      {item("upcoming", <CalendarIcon className="size-4" />, "Upcoming")}
      {item("all", <InboxIcon className="size-4" />, "All tasks")}
      <Separator className="my-2" />
      <div className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
        {topics.map((t) =>
          item(
            `topic:${t.id}`,
            <span className={cn("mx-1 size-2 shrink-0 rounded-full", DOT[t.color])} />,
            t.name,
            counts.byTopic[t.id]
          )
        )}
        {adding ? (
          <form onSubmit={addTopic} className="px-1 py-0.5">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={addTopic}
              onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
              placeholder="Topic name"
              className="h-8 text-base md:text-sm"
            />
          </form>
        ) : (
          <button
            onClick={() => {
              handled.current = false
              setAdding(true)
            }}
            className="flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <PlusIcon className="size-4" />
            New topic
          </button>
        )}
      </div>
      <div className="mt-auto flex items-center gap-1 pt-3">
        <ReminderToggle />
        <ThemeToggle />
      </div>
    </div>
  )
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="ml-auto text-muted-foreground"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle dark mode"
    >
      <SunMediumIcon className="hidden dark:block" />
      <MoonIcon className="dark:hidden" />
    </Button>
  )
}

const PUSH_LABEL: Record<PushState, string> = {
  on: "Reminders on",
  off: "Turn on reminders",
  denied: "Notifications blocked",
  unsupported: "Reminders unavailable",
  "needs-install": "Add to Home Screen for reminders",
}

function ReminderToggle() {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getPushState().then(setState)
  }, [])
  if (!state) return null
  const on = state === "on"
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={busy || state === "unsupported"}
      className={cn("min-w-0 justify-start text-xs", on ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}
      title={
        state === "needs-install"
          ? "On iPhone: tap Share → Add to Home Screen, then open the app from there."
          : state === "denied"
            ? "Allow notifications for this site in your browser settings."
            : undefined
      }
      onClick={async () => {
        if (state !== "on" && state !== "off") return
        setBusy(true)
        try {
          setState(await (on ? disablePush() : enablePush()))
        } finally {
          setBusy(false)
        }
      }}
    >
      {on ? <BellRingIcon /> : <BellOffIcon />}
      <span className="truncate">{PUSH_LABEL[state]}</span>
    </Button>
  )
}

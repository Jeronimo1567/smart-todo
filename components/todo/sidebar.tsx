"use client"

import {
  BellOffIcon,
  BellRingIcon,
  CalendarIcon,
  InboxIcon,
  MoonIcon,
  PanelLeftCloseIcon,
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

// Every row has the same geometry in both states (p-2 container, px-3 row, 16px icon box),
// so collapsing only hides labels: icons never move. Rail width = 8 + 12 + 16 + 12 + 8 = 56px.
const ROW =
  "relative flex h-9 w-full shrink-0 items-center gap-3 rounded-md px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"

function IconBox({ children }: { children: React.ReactNode }) {
  return <span className="flex size-4 shrink-0 items-center justify-center">{children}</span>
}

export function Sidebar({
  view,
  onSelect,
  topics,
  counts,
  collapsed = false,
  onToggle,
}: {
  view: View
  onSelect: (v: View) => void
  topics: Topic[]
  counts: { today: number; overdue: number; byTopic: Record<string, number> }
  /** Desktop only: icon rail instead of the full sidebar. */
  collapsed?: boolean
  /** Desktop only: shows the collapse / expand control. */
  onToggle?: () => void
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
      title={collapsed ? label : undefined}
      aria-label={label}
      className={cn(ROW, view === v && "bg-muted font-medium text-foreground")}
    >
      <IconBox>{icon}</IconBox>
      {!collapsed && <span className="truncate">{label}</span>}
      {!collapsed && count ? (
        <span className={cn("ml-auto text-xs tabular-nums", alert ? "font-medium text-destructive" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
      {collapsed && alert && <span className="absolute top-1.5 left-7 size-1.5 rounded-full bg-destructive" />}
    </button>
  )

  return (
    <div className="flex h-full w-full flex-col gap-0.5 overflow-hidden p-2">
      <div className="mb-2 flex h-9 shrink-0 items-center">
        {collapsed ? (
          <button
            onClick={onToggle}
            className={cn(ROW, "px-2.5")}
            aria-label="Show sidebar"
            title="Show sidebar (⌘B)"
          >
            <Logo />
          </button>
        ) : (
          <>
            <span className="flex min-w-0 items-center gap-2.5 px-2.5 text-sm font-semibold">
              <Logo />
              <span className="truncate">MCP Enabled Todo List</span>
            </span>
            {onToggle && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="ml-auto shrink-0 text-muted-foreground"
                onClick={onToggle}
                aria-label="Hide sidebar"
                title="Hide sidebar (⌘B)"
              >
                <PanelLeftCloseIcon />
              </Button>
            )}
          </>
        )}
      </div>

      {item("today", <SunIcon className="size-4" />, "Today", counts.today, counts.overdue > 0)}
      {item("upcoming", <CalendarIcon className="size-4" />, "Upcoming")}
      {item("all", <InboxIcon className="size-4" />, "All tasks")}
      <Separator className="my-2" />
      <div className="flex min-h-0 w-full flex-col gap-0.5 overflow-y-auto">
        {topics.map((t) =>
          item(
            `topic:${t.id}`,
            <span className={cn("size-2 rounded-full", DOT[t.color])} />,
            t.name,
            counts.byTopic[t.id]
          )
        )}
        {adding && !collapsed ? (
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
              if (collapsed) onToggle?.()
            }}
            title={collapsed ? "New topic" : undefined}
            aria-label="New topic"
            className={ROW}
          >
            <IconBox>
              <PlusIcon className="size-4" />
            </IconBox>
            {!collapsed && "New topic"}
          </button>
        )}
      </div>

      <div className="mt-auto flex w-full flex-col gap-0.5 pt-2">
        <ReminderToggle collapsed={collapsed} />
        <ThemeToggle collapsed={collapsed} />
      </div>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, tiny file
  return <img src="/logo.png" alt="" width={20} height={20} className={cn("size-5 shrink-0", className)} />
}

function ThemeToggle({ collapsed }: { collapsed: boolean }) {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === "dark"
  const label = dark ? "Light mode" : "Dark mode"
  return (
    <button
      className={ROW}
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label={label}
      title={collapsed ? label : undefined}
    >
      <IconBox>
        <SunMediumIcon className="hidden size-4 dark:block" />
        <MoonIcon className="size-4 dark:hidden" />
      </IconBox>
      {!collapsed && <span className="truncate">{label}</span>}
    </button>
  )
}

const PUSH_LABEL: Record<PushState, string> = {
  on: "Reminders on",
  off: "Turn on reminders",
  denied: "Notifications blocked",
  unsupported: "Reminders unavailable",
  "needs-install": "Add to Home Screen for reminders",
}

const PUSH_HINT: Partial<Record<PushState, string>> = {
  "needs-install": "On iPhone: tap Share → Add to Home Screen, then open the app from there.",
  denied: "Allow notifications for this site in your browser settings.",
}

function ReminderToggle({ collapsed }: { collapsed: boolean }) {
  const [state, setState] = useState<PushState | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    getPushState().then(setState)
  }, [])
  if (!state) return <div className="h-9 shrink-0" />
  const on = state === "on"
  return (
    <button
      disabled={busy || state === "unsupported"}
      className={cn(ROW, "disabled:opacity-50", !on && "text-amber-700 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-400")}
      aria-label={PUSH_LABEL[state]}
      title={PUSH_HINT[state] ?? (collapsed ? PUSH_LABEL[state] : undefined)}
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
      <IconBox>{on ? <BellRingIcon className="size-4" /> : <BellOffIcon className="size-4" />}</IconBox>
      {!collapsed && <span className="truncate text-xs">{PUSH_LABEL[state]}</span>}
    </button>
  )
}

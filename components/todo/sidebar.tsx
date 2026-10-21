"use client"

import {
  BellOffIcon,
  BellRingIcon,
  CalendarIcon,
  InboxIcon,
  PanelLeftCloseIcon,
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
      aria-label={collapsed ? label : undefined}
      className={cn(
        "relative flex h-9 w-full shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        collapsed && "justify-center px-0",
        view === v && "bg-muted font-medium text-foreground"
      )}
    >
      {icon}
      {collapsed ? (
        alert && <span className="absolute top-1.5 right-2 size-1.5 rounded-full bg-destructive" />
      ) : (
        <span className="truncate">{label}</span>
      )}
      {!collapsed && count ? (
        <span className={cn("ml-auto text-xs tabular-nums", alert ? "font-medium text-destructive" : "text-muted-foreground")}>
          {count}
        </span>
      ) : null}
    </button>
  )

  return (
    <div className={cn("flex h-full flex-col gap-0.5", collapsed ? "items-center p-2" : "p-3")}>
      {collapsed ? (
        <Button
          variant="ghost"
          size="icon"
          className="mb-3 shrink-0"
          onClick={onToggle}
          aria-label="Show sidebar"
          title="Show sidebar (⌘B)"
        >
          <Logo />
        </Button>
      ) : (
        <div className="mb-3 flex h-9 items-center gap-1.5 pl-2 text-sm font-semibold">
          <Logo />
          <span className="truncate">MCP Enabled Todo List</span>
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
        </div>
      )}
      {item("today", <SunIcon className="size-4" />, "Today", counts.today, counts.overdue > 0)}
      {item("upcoming", <CalendarIcon className="size-4" />, "Upcoming")}
      {item("all", <InboxIcon className="size-4" />, "All tasks")}
      <Separator className="my-2" />
      <div className="flex min-h-0 w-full flex-col gap-0.5 overflow-y-auto">
        {topics.map((t) =>
          item(
            `topic:${t.id}`,
            <span className={cn("mx-1 size-2 shrink-0 rounded-full", DOT[t.color])} />,
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
            className={cn(
              "flex h-9 shrink-0 items-center gap-2.5 rounded-md px-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
              collapsed && "justify-center px-0"
            )}
          >
            <PlusIcon className="size-4" />
            {!collapsed && "New topic"}
          </button>
        )}
      </div>
      <div className={cn("mt-auto flex gap-1 pt-3", collapsed ? "flex-col items-center" : "w-full items-center")}>
        <ReminderToggle compact={collapsed} />
        <ThemeToggle className={collapsed ? undefined : "ml-auto"} />
      </div>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, tiny file
  return <img src="/logo.png" alt="" width={20} height={20} className={cn("size-5 shrink-0", className)} />
}

function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={cn("text-muted-foreground", className)}
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

function ReminderToggle({ compact }: { compact?: boolean }) {
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
      size={compact ? "icon-sm" : "sm"}
      disabled={busy || state === "unsupported"}
      className={cn("min-w-0 justify-start text-xs", on ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}
      aria-label={PUSH_LABEL[state]}
      title={
        state === "needs-install"
          ? "On iPhone: tap Share → Add to Home Screen, then open the app from there."
          : state === "denied"
            ? "Allow notifications for this site in your browser settings."
            : compact
              ? PUSH_LABEL[state]
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
      {!compact && <span className="truncate">{PUSH_LABEL[state]}</span>}
    </Button>
  )
}

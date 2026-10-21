"use client"

import { CalendarIcon, InboxIcon, PanelLeftCloseIcon, PlusIcon, SettingsIcon, SunIcon } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { getPushState } from "@/lib/push"
import { saveTopic } from "@/lib/store"
import { cn } from "@/lib/utils"
import { TOPIC_COLORS, type Topic } from "@/shared/types"

import { TopicGlyph, TopicIconPicker } from "./topic-icon"

export type View = "today" | "upcoming" | "all" | `topic:${string}`

// Every row has the same geometry in both states (p-2 container, px-3 row, 16px icon box),
// so collapsing only hides labels: icons never move. Rail width = 8 + 12 + 16 + 12 + 8 = 56px.
// On phones (the menu sheet) rows and icons are larger for fingers.
const ROW =
  "relative flex h-11 w-full shrink-0 items-center gap-3 rounded-md px-3 text-base text-muted-foreground hover:bg-muted hover:text-foreground md:h-9 md:text-sm [&_svg]:size-5 md:[&_svg]:size-4"

function IconBox({ children }: { children: React.ReactNode }) {
  return <span className="flex size-5 shrink-0 items-center justify-center md:size-4">{children}</span>
}

export function Sidebar({
  view,
  onSelect,
  topics,
  counts,
  collapsed = false,
  onToggle,
  onOpenSettings,
}: {
  view: View
  onSelect: (v: View) => void
  topics: Topic[]
  counts: { today: number; overdue: number; byTopic: Record<string, number> }
  /** Desktop only: icon rail instead of the full sidebar. */
  collapsed?: boolean
  /** Desktop only: shows the collapse / expand control. */
  onToggle?: () => void
  onOpenSettings: () => void
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState("")
  const handled = useRef(false) // Enter and the following blur both fire
  // Nudge (amber dot on Settings) until reminders are on for this device.
  const [remindersOff, setRemindersOff] = useState(false)
  useEffect(() => {
    getPushState().then((s) => setRemindersOff(s === "off" || s === "needs-install"))
  }, [])

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
        {topics.map((t) => {
          const v: View = `topic:${t.id}`
          if (collapsed) return item(v, <TopicGlyph topic={t} />, t.name)
          const count = counts.byTopic[t.id]
          // A div, not a button: it contains the icon picker's own button.
          return (
            <div
              key={v}
              role="button"
              tabIndex={0}
              aria-label={t.name}
              onClick={() => onSelect(v)}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault()
                  onSelect(v)
                }
              }}
              className={cn(ROW, "cursor-pointer", view === v && "bg-muted font-medium text-foreground")}
            >
              <TopicIconPicker topic={t} className="relative size-5 after:absolute after:-inset-2 md:size-4" />
              <span className="truncate">{t.name}</span>
              {count ? <span className="ml-auto text-xs text-muted-foreground tabular-nums">{count}</span> : null}
            </div>
          )
        })}
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

      <div className="mt-auto flex w-full flex-col pt-2">
        <button
          onClick={onOpenSettings}
          className={ROW}
          aria-label="Settings"
          title={collapsed ? "Settings" : undefined}
        >
          <IconBox>
            <SettingsIcon />
          </IconBox>
          {!collapsed && <span>Settings</span>}
          {remindersOff && (
            <span
              className={cn("size-1.5 rounded-full bg-amber-500", collapsed ? "absolute top-1.5 left-7" : "ml-auto")}
              title="Reminders are off on this device"
            />
          )}
        </button>
      </div>
    </div>
  )
}

export function Logo({ className }: { className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- static export, tiny file
  return <img src="/logo.png" alt="" width={20} height={20} className={cn("size-5 shrink-0", className)} />
}

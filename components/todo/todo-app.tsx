"use client"

import { ChevronRightIcon, MenuIcon, PencilIcon } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { haptic } from "@/lib/haptics"
import { DAY, byDue, dayLabel, isOverdue, startOfToday } from "@/lib/format"
import { registerSW } from "@/lib/push"
import { saveTask, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Task, Topic } from "@/shared/types"

import { Login } from "./login"
import { AddTaskRow, QuickAdd } from "./quick-add"
import { SettingsDialog } from "./settings-dialog"
import { Sidebar, type View } from "./sidebar"
import { TaskDialog } from "./task-dialog"
import { TaskRow } from "./task-row"
import { TopicDialog } from "./topic-dialog"
import { TopicIconPicker } from "./topic-icon"

type Section = { key: string; label?: string; tone?: "danger"; tasks: Task[]; showTopic: boolean }

// Small per-device preferences (last opened list, sidebar collapsed).
const prefListeners = new Set<() => void>()
function subscribePref(l: () => void) {
  prefListeners.add(l)
  return () => void prefListeners.delete(l)
}
function usePref<T extends string>(key: string, fallback: T) {
  const value = useSyncExternalStore(
    subscribePref,
    () => {
      try {
        return (localStorage.getItem(key) as T | null) ?? fallback
      } catch {
        return fallback
      }
    },
    () => fallback
  )
  const set = useCallback(
    (v: T) => {
      localStorage.setItem(key, v)
      for (const l of prefListeners) l()
    },
    [key]
  )
  return [value, set] as const
}

/** Deletes the completed tasks shown in this list. Two taps so it can't happen by accident. */
function ClearCompleted({ tasks }: { tasks: Task[] }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const t = setTimeout(() => setArmed(false), 3000)
    return () => clearTimeout(t)
  }, [armed])
  return (
    <button
      onClick={() => {
        if (!armed) {
          haptic("light")
          return setArmed(true)
        }
        haptic("warning")
        for (const t of tasks) saveTask(t.id, { deleted: true })
        setArmed(false)
      }}
      className={cn(
        "rounded-md px-2 py-2.5 text-sm text-muted-foreground hover:text-foreground md:py-1 md:text-xs",
        armed && "font-medium text-destructive hover:text-destructive"
      )}
    >
      {armed ? `Tap again to clear ${tasks.length}` : "Clear all"}
    </button>
  )
}

export function TodoApp() {
  const { tasks: taskMap, topics: topicMap, authed, hydrated } = useStore()
  const [view, setView] = usePref<View>("todo:view", "today")
  const [collapsed, setCollapsed] = usePref<"0" | "1">("todo:sidebar-collapsed", "0")
  const toggleSidebar = useCallback(() => setCollapsed(collapsed === "1" ? "0" : "1"), [collapsed, setCollapsed])
  // Cmd/Ctrl+B toggles the sidebar on desktop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        e.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [toggleSidebar])
  const [openId, setOpenId] = useState<string | null>(null)
  const [editTopic, setEditTopic] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showDone, setShowDone] = useState(false)
  // Re-render at midnight-ish so "Today" stays right.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (process.env.NODE_ENV === "production") registerSW()
  }, [])

  const topics = useMemo(() => Object.values(topicMap).sort((a, b) => a.position - b.position), [topicMap])
  const topicById = topicMap
  const all = useMemo(() => Object.values(taskMap), [taskMap])
  const open = useMemo(() => all.filter((t) => !t.doneAt).sort(byDue), [all])

  const todayEnd = startOfToday(now) + DAY
  const counts = useMemo(() => {
    const byTopic: Record<string, number> = {}
    let today = 0
    let overdue = 0
    for (const t of open) {
      if (t.topicId) byTopic[t.topicId] = (byTopic[t.topicId] ?? 0) + 1
      if (t.dueAt !== null && t.dueAt < todayEnd) today++
      if (isOverdue(t, now)) overdue++
    }
    return { byTopic, today, overdue }
  }, [open, todayEnd, now])

  const activeTopic = view.startsWith("topic:") ? topicById[view.slice(6)] : undefined
  // Topic was deleted (maybe on another device): fall back to Today.
  useEffect(() => {
    if (hydrated && view.startsWith("topic:") && !activeTopic && Object.keys(topicMap).length) setView("today")
  }, [hydrated, view, activeTopic, topicMap, setView])

  const { title, sections, done } = useMemo((): { title: string; sections: Section[]; done: Task[] } => {
    const recentDone = (list: Task[]) => list.filter((t) => t.doneAt).sort((a, b) => b.doneAt! - a.doneAt!)
    if (view === "today") {
      const overdue = open.filter((t) => isOverdue(t, now))
      const today = open.filter((t) => !overdue.includes(t) && t.dueAt !== null && t.dueAt < todayEnd)
      return {
        title: "Today",
        sections: [
          { key: "overdue", label: "Overdue", tone: "danger", tasks: overdue, showTopic: true },
          { key: "today", label: overdue.length ? "Today" : undefined, tasks: today, showTopic: true },
        ],
        done: recentDone(all).filter((t) => t.doneAt! >= startOfToday(now)),
      }
    }
    if (view === "upcoming") {
      const groups = new Map<string, Task[]>()
      for (const t of open) {
        if (t.dueAt === null || t.dueAt < todayEnd) continue
        const label = dayLabel(t.dueAt, now)
        groups.set(label, [...(groups.get(label) ?? []), t])
      }
      return {
        title: "Upcoming",
        sections: [...groups].map(([label, tasks]) => ({ key: label, label, tasks, showTopic: true })),
        done: [],
      }
    }
    if (view === "all") {
      const sections: Section[] = topics.map((tp) => ({
        key: tp.id,
        label: tp.name,
        tasks: open.filter((t) => t.topicId === tp.id),
        showTopic: false,
      }))
      sections.push({ key: "none", label: "No topic", tasks: open.filter((t) => !t.topicId || !topicById[t.topicId]), showTopic: false })
      return { title: "All tasks", sections, done: recentDone(all).slice(0, 50) }
    }
    const id = view.slice(6)
    return {
      title: activeTopic?.name ?? "",
      sections: [{ key: "open", tasks: open.filter((t) => t.topicId === id), showTopic: false }],
      done: recentDone(all.filter((t) => t.topicId === id)),
    }
  }, [view, open, all, topics, topicById, activeTopic, now, todayEnd])

  const onOpen = useCallback((id: string) => setOpenId(id), [])
  const select = useCallback(
    (v: View) => {
      setView(v)
      setMenuOpen(false)
      setShowDone(false)
    },
    [setView]
  )

  if (authed === false) return <Login />

  const empty = sections.every((s) => !s.tasks.length)
  const addProps = { topics, defaultTopicId: activeTopic?.id ?? null, defaultToday: view === "today" }
  const openSettings = () => {
    setMenuOpen(false)
    setSettingsOpen(true)
  }
  const isCollapsed = collapsed === "1"

  return (
    <div className="flex h-dvh">
      <aside
        className={cn(
          "hidden shrink-0 overflow-hidden border-r bg-muted/30 md:block",
          isCollapsed ? "w-14" : "w-64"
        )}
      >
        <Sidebar
          view={view}
          onSelect={select}
          topics={topics}
          counts={counts}
          collapsed={isCollapsed}
          onToggle={toggleSidebar}
          onOpenSettings={openSettings}
        />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-72 bg-background pt-[env(safe-area-inset-top)]" showCloseButton={false}>
          <SheetTitle className="sr-only">Lists</SheetTitle>
          <Sidebar view={view} onSelect={select} topics={topics} counts={counts} onOpenSettings={openSettings} />
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-1 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2 md:px-8 md:pt-8 md:pb-4">
          <Button
            variant="ghost"
            size="icon"
            className="size-11 md:hidden [&_svg:not([class*='size-'])]:size-6"
            onClick={() => {
              haptic("light")
              setMenuOpen(true)
            }}
            aria-label="Open lists"
          >
            <MenuIcon />
          </Button>
          <h1 className="flex min-w-0 items-center gap-2 text-xl font-semibold md:text-2xl">
            {activeTopic && (
              <TopicIconPicker
                topic={activeTopic}
                className="relative size-6 after:absolute after:-inset-2"
                glyphClassName="size-5"
              />
            )}
            <span className="truncate">{title}</span>
          </h1>
          {activeTopic && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 text-muted-foreground md:size-8"
              onClick={() => setEditTopic(true)}
              aria-label="Edit topic"
            >
              <PencilIcon />
            </Button>
          )}
        </header>

        <div className="hidden px-8 md:block">
          <QuickAdd {...addProps} className="mb-3" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-[max(env(safe-area-inset-bottom),1.5rem)] md:px-6 md:pb-6">
          {hydrated && empty && (
            <p className="hidden px-3 py-10 text-center text-sm text-muted-foreground md:block">
              {view === "today" ? "Nothing due today. Nice." : done.length ? "All done." : "No tasks here yet."}
            </p>
          )}
          {sections.map(
            (s) =>
              s.tasks.length > 0 && (
                <section key={s.key} className="mb-3">
                  {s.label && (
                    <h2
                      className={cn(
                        "px-2 pt-2 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase",
                        s.tone === "danger" && "text-destructive"
                      )}
                    >
                      {s.label}
                    </h2>
                  )}
                  {s.tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      topic={s.showTopic && t.topicId ? (topicById[t.topicId] as Topic | undefined) : undefined}
                      onOpen={onOpen}
                    />
                  ))}
                </section>
              )
          )}
          <AddTaskRow key={view} {...addProps} className="md:hidden" />
          {done.length > 0 && (
            <section className="mt-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowDone(!showDone)}
                  className="flex items-center gap-1 px-2 py-2.5 text-sm font-medium tracking-wide text-muted-foreground uppercase hover:text-foreground md:py-1 md:text-xs"
                >
                  <ChevronRightIcon className={cn("size-3.5 transition-transform", showDone && "rotate-90")} />
                  Completed ({done.length})
                </button>
                <ClearCompleted tasks={done} />
              </div>
              {showDone &&
                done.map((t) => (
                  <TaskRow
                    key={t.id}
                    task={t}
                    topic={!activeTopic && t.topicId ? topicById[t.topicId] : undefined}
                    onOpen={onOpen}
                  />
                ))}
            </section>
          )}
        </div>

      </main>

      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <TaskDialog task={openId ? (taskMap[openId] ?? null) : null} topics={topics} onClose={() => setOpenId(null)} />
      <TopicDialog
        topic={editTopic && activeTopic ? activeTopic : null}
        tasks={all}
        onClose={() => setEditTopic(false)}
        onDeleted={() => {
          setEditTopic(false)
          select("today")
        }}
      />
    </div>
  )
}

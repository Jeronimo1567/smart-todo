"use client"

import { BellRingIcon, CalendarIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { dueLabel, startOfToday } from "@/lib/format"
import { parseQuickAdd } from "@/lib/parse"
import { addTask } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Topic } from "@/shared/types"

import { TopicGlyph } from "./topic-icon"

export function QuickAdd({
  topics,
  defaultTopicId,
  defaultToday,
  className,
}: {
  topics: Topic[]
  defaultTopicId?: string | null
  /** In the Today view, undated tasks land on today. */
  defaultToday?: boolean
  className?: string
}) {
  const [value, setValue] = useState("")
  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value, topics) : null), [value, topics])
  const topic = topics.find((t) => t.id === (parsed?.topicId ?? defaultTopicId))
  const showTopicChip = parsed?.topicId && parsed.topicId !== defaultTopicId

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!parsed) return
    const due =
      parsed.dueAt === null && defaultToday
        ? { dueAt: startOfToday(), allDay: true }
        : { dueAt: parsed.dueAt, allDay: parsed.allDay }
    addTask({
      title: parsed.title,
      topicId: parsed.topicId ?? defaultTopicId ?? null,
      important: parsed.important,
      ...due,
    })
    setValue("")
  }

  return (
    <form onSubmit={submit} className={cn("relative", className)}>
      <PlusIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a task… try “essay fri 5pm !”"
        className="h-11 pr-2 pl-9 text-base md:h-10 md:text-sm"
        enterKeyHint="done"
        autoComplete="off"
      />
      {parsed && (parsed.dueAt !== null || parsed.important || showTopicChip) && (
        <div className="pointer-events-none absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1.5 bg-background pl-2 text-xs text-muted-foreground">
          {showTopicChip && topic && (
            <span className="flex items-center gap-1">
              <TopicGlyph topic={topic} className="size-3" />
              {topic.name}
            </span>
          )}
          {parsed.dueAt !== null && (
            <span className="flex items-center gap-1">
              <CalendarIcon className="size-3" />
              {dueLabel(parsed)}
            </span>
          )}
          {parsed.important && <BellRingIcon className="size-3.5 text-amber-500" />}
        </div>
      )}
    </form>
  )
}

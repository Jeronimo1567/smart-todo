"use client"

import { BellRingIcon, CalendarIcon, PlusIcon } from "lucide-react"
import { useMemo, useState } from "react"

import { Input } from "@/components/ui/input"
import { dueLabel, startOfToday } from "@/lib/format"
import { type Parsed, parseQuickAdd } from "@/lib/parse"
import { addTask } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Topic } from "@/shared/types"

import { TopicGlyph } from "./topic-icon"

type Props = {
  topics: Topic[]
  defaultTopicId?: string | null
  /** In the Today view, undated tasks land on today. */
  defaultToday?: boolean
  className?: string
}

function useQuickAdd({ topics, defaultTopicId, defaultToday }: Props) {
  const [value, setValue] = useState("")
  const parsed = useMemo(() => (value.trim() ? parseQuickAdd(value, topics) : null), [value, topics])
  function submit() {
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
  return { value, setValue, parsed, submit }
}

/** What the parser understood: topic, date, importance. */
function Chips({ parsed, topics, defaultTopicId }: { parsed: Parsed | null; topics: Topic[]; defaultTopicId?: string | null }) {
  if (!parsed) return null
  const topic = parsed.topicId && parsed.topicId !== defaultTopicId ? topics.find((t) => t.id === parsed.topicId) : null
  if (!topic && parsed.dueAt === null && !parsed.important) return null
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {topic && (
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
    </span>
  )
}

/** Desktop: always-visible input bar at the top of the list. */
export function QuickAdd(props: Props) {
  const { value, setValue, parsed, submit } = useQuickAdd(props)
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn("relative", props.className)}
    >
      <PlusIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a task… try “essay fri 5pm !”"
        className="h-10 pr-2 pl-9"
        autoComplete="off"
      />
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 bg-background pl-2">
        <Chips parsed={parsed} topics={props.topics} defaultTopicId={props.defaultTopicId} />
      </span>
    </form>
  )
}

/** Phone: an "Add task" row at the end of the list that turns into an input when tapped. */
export function AddTaskRow(props: Props) {
  const { value, setValue, parsed, submit } = useQuickAdd(props)
  const [editing, setEditing] = useState(false)
  const circle =
    "flex size-6 shrink-0 items-center justify-center rounded-full border border-dashed border-muted-foreground/60 text-muted-foreground"

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={cn(
          "flex w-full items-center gap-3 rounded-lg px-2 py-3 text-base text-muted-foreground active:bg-muted",
          props.className
        )}
      >
        <span className={circle}>
          <PlusIcon className="size-4" />
        </span>
        Add task
      </button>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit() // stays open for the next one
      }}
      className={cn("flex items-start gap-3 rounded-lg bg-muted/60 px-2 py-3", props.className)}
    >
      <span className={circle}>
        <PlusIcon className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => !value.trim() && setEditing(false)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setValue("")
              setEditing(false)
            }
          }}
          placeholder="e.g. essay fri 5pm !"
          enterKeyHint="done"
          autoComplete="off"
          className="w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
          aria-label="New task"
        />
        <Chips parsed={parsed} topics={props.topics} defaultTopicId={props.defaultTopicId} />
      </div>
    </form>
  )
}

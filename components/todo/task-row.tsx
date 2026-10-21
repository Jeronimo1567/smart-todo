"use client"

import { BellRingIcon, NotebookTextIcon } from "lucide-react"
import { memo } from "react"

import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { dueLabel, dueTone, type Tone } from "@/lib/format"
import { saveTask } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Task, Topic } from "@/shared/types"

import { TopicGlyph } from "./topic-icon"

const TONE: Record<Tone, string> = {
  overdue: "bg-destructive/10 text-destructive",
  today: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  soon: "bg-muted text-foreground",
  later: "bg-transparent text-muted-foreground",
}

export const TaskRow = memo(function TaskRow({
  task,
  topic,
  onOpen,
}: {
  task: Task
  /** Pass to show the topic under the title. */
  topic?: Topic
  onOpen: (id: string) => void
}) {
  const done = !!task.doneAt
  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/60 md:py-2">
      <Checkbox
        checked={done}
        onCheckedChange={(v) => saveTask(task.id, { doneAt: v ? Date.now() : null })}
        className="size-6 rounded-full md:size-5"
        aria-label={done ? "Mark not done" : "Mark done"}
      />
      <button onClick={() => onOpen(task.id)} className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5 text-left">
        <span className={cn("truncate text-base md:text-sm", done && "text-muted-foreground line-through")}>
          {task.title}
        </span>
        {(topic || task.notes) && (
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground md:text-xs">
            {topic && (
              <>
                <TopicGlyph topic={topic} className="size-3" />
                {topic.name}
              </>
            )}
            {task.notes && <NotebookTextIcon className="size-3" />}
          </span>
        )}
      </button>
      {task.important && !done && <BellRingIcon className="size-4 shrink-0 text-amber-500" aria-label="Important" />}
      {task.dueAt !== null && !done && (
        <Badge className={cn("shrink-0 rounded-md font-normal", TONE[dueTone(task)])}>{dueLabel(task)}</Badge>
      )}
    </div>
  )
})

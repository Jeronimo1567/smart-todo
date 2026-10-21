"use client"

import { BellRingIcon, CheckIcon, Trash2Icon, XIcon } from "lucide-react"
import { type RefObject, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { haptic } from "@/lib/haptics"
import { fromInputs, startOfToday, toDateInput, toTimeInput } from "@/lib/format"
import { saveTask } from "@/lib/store"
import { cn } from "@/lib/utils"
import type { Task, TaskPatch, Topic } from "@/shared/types"

const field =
  "h-10 w-full min-w-0 rounded-md border border-input bg-transparent px-2.5 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30"

export function TaskDialog({ task, topics, onClose }: { task: Task | null; topics: Topic[]; onClose: () => void }) {
  // Closing by Escape / tapping outside saves too.
  const commitRef = useRef<(() => void) | null>(null)
  return (
    <Dialog open={!!task} onOpenChange={(open) => !open && (commitRef.current ?? onClose)()}>
      <DialogContent className="gap-4 sm:max-w-lg" showCloseButton={false}>
        {task && <Editor key={task.id} task={task} topics={topics} onClose={onClose} commitRef={commitRef} />}
      </DialogContent>
    </Dialog>
  )
}

/** iOS shows nothing in an empty date/time field, so label it ourselves. */
function Placeholder({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-base text-muted-foreground md:text-sm">
      {children}
    </span>
  )
}

function Editor({
  task,
  topics,
  onClose,
  commitRef,
}: {
  task: Task
  topics: Topic[]
  onClose: () => void
  commitRef: RefObject<(() => void) | null>
}) {
  const [title, setTitle] = useState(task.title)
  const [notes, setNotes] = useState(task.notes)
  const [topicId, setTopicId] = useState(task.topicId ?? "")
  const [date, setDate] = useState(toDateInput(task.dueAt))
  const [time, setTime] = useState(toTimeInput(task.dueAt, task.allDay))
  const [ios] = useState(() => /iP(hone|ad|od)/.test(navigator.userAgent))
  const [important, setImportant] = useState(task.important)

  // Only send what changed, so remote edits to other fields aren't clobbered.
  function commit(extra: TaskPatch = {}) {
    const due = fromInputs(date, time)
    const patch: TaskPatch = { ...extra }
    if (title.trim() && title.trim() !== task.title) patch.title = title.trim()
    if (notes !== task.notes) patch.notes = notes
    if ((topicId || null) !== task.topicId) patch.topicId = topicId || null
    if (important !== task.important) patch.important = important
    if (due.dueAt !== task.dueAt || due.allDay !== task.allDay) Object.assign(patch, due)
    if (Object.keys(patch).length) saveTask(task.id, patch)
    onClose()
  }
  useEffect(() => {
    commitRef.current = () => commit()
    return () => {
      commitRef.current = null
    }
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        commit()
      }}
      className="flex flex-col gap-4"
    >
      <DialogTitle className="sr-only">Edit task</DialogTitle>
      <div className="flex items-start gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="h-auto border-none bg-transparent px-0 text-lg font-medium md:text-lg shadow-none focus-visible:ring-0 dark:bg-transparent"
          aria-label="Title"
        />
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => commit()} aria-label="Close">
          <XIcon />
        </Button>
      </div>

      <Textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes"
        className="min-h-20 text-base md:text-sm"
      />

      <div className="grid grid-cols-2 gap-2">
        <select value={topicId} onChange={(e) => setTopicId(e.target.value)} className={field} aria-label="Topic">
          <option value="">No topic</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            haptic(important ? "light" : "rigid")
            setImportant(!important)
          }}
          aria-pressed={important}
          className={cn("h-10", important && "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400")}
        >
          <BellRingIcon />
          {important ? "Important" : "Not important"}
        </Button>
        {/* Date, then time; on narrow phones the time wraps to its own line instead of squeezing the date. */}
        <div className="col-span-2 flex flex-wrap gap-2">
          <label className="relative min-w-0 flex-1 basis-44">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={field}
              aria-label="Due date"
            />
            {ios && !date && <Placeholder>Due date</Placeholder>}
          </label>
          <label className="relative min-w-0 flex-1 basis-28">
            <input
              type="time"
              value={time}
              onChange={(e) => {
                setTime(e.target.value)
                // Picking a time without a date means today.
                if (e.target.value && !date) setDate(toDateInput(startOfToday()))
              }}
              className={field}
              aria-label="Due time"
            />
            {ios && !time && <Placeholder>{date ? "All day" : "Time"}</Placeholder>}
          </label>
          {date && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10"
              onClick={() => {
                setDate("")
                setTime("")
              }}
              aria-label="Clear due date"
            >
              <XIcon />
            </Button>
          )}
        </div>
      </div>
      {important && (
        <p className="-mt-1 text-xs text-muted-foreground">
          Important tasks remind you 1 day, 3 h and 1 h before, then keep reminding you while overdue.
        </p>
      )}

      <div className="flex items-center justify-between pt-1">
        <Button type="button" variant="destructive" onClick={() => {
            haptic("warning")
            commit({ deleted: true })
          }}>
          <Trash2Icon />
          Delete
        </Button>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => {
              haptic(task.doneAt ? "light" : "success")
              commit({ doneAt: task.doneAt ? null : Date.now() })
            }}>
            <CheckIcon />
            {task.doneAt ? "Reopen" : "Done"}
          </Button>
          <Button type="submit">Save</Button>
        </div>
      </div>
    </form>
  )
}

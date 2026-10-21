"use client"

import { BellRingIcon, CalendarIcon, CheckIcon, Trash2Icon, XIcon } from "lucide-react"
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

import { TimePicker } from "./time-picker"

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

/** "2026-10-21" -> "Wed, Oct 21" (weekday hidden on narrow phones; year only if not this year). */
function DateLabel({ value }: { value: string }) {
  const [y, m, d] = value.split("-").map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" })
  const rest = date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(y !== new Date().getFullYear() ? { year: "numeric" } : {}),
  })
  return (
    <>
      <span className="hidden sm:inline">{weekday}, </span>
      {rest}
    </>
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
        <div className="col-span-2 flex gap-2">
          {/* Short label that matches the time field; the real (invisible) date input on top opens the system calendar. */}
          <label className={cn(field, "relative flex min-w-0 flex-1 items-center gap-2", !date && "text-muted-foreground")}>
            <span className="truncate">{date ? <DateLabel value={date} /> : "Add date"}</span>
            <CalendarIcon className="ml-auto size-4 shrink-0 opacity-60" />
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              onClick={(e) => e.currentTarget.showPicker?.()}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
              aria-label="Due date"
            />
          </label>
          <TimePicker
            value={time}
            onChange={(v) => {
              setTime(v)
              // Picking a time without a date means today.
              if (v && !date) setDate(toDateInput(startOfToday()))
            }}
            className={cn(field, "min-w-0 flex-1")}
          />
          {/* Always rendered (just hidden) so the two fields keep the same width. */}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn("size-10 shrink-0 md:size-9", !date && !time && "invisible")}
            onClick={() => {
              setDate("")
              setTime("")
            }}
            aria-label="Clear due date"
          >
            <XIcon />
          </Button>
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

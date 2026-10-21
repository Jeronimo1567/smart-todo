"use client"

import { Trash2Icon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { saveTask, saveTopic } from "@/lib/store"
import type { Task, Topic } from "@/shared/types"

export function TopicDialog({
  topic,
  tasks,
  onClose,
  onDeleted,
}: {
  topic: Topic | null
  tasks: Task[]
  onClose: () => void
  onDeleted: () => void
}) {
  return (
    <Dialog open={!!topic} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {topic && <Editor key={topic.id} topic={topic} tasks={tasks} onClose={onClose} onDeleted={onDeleted} />}
      </DialogContent>
    </Dialog>
  )
}

function Editor({ topic, tasks, onClose, onDeleted }: { topic: Topic; tasks: Task[]; onClose: () => void; onDeleted: () => void }) {
  const [name, setName] = useState(topic.name)
  const [confirm, setConfirm] = useState(false)
  const inTopic = tasks.filter((t) => t.topicId === topic.id)

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (name.trim() && name.trim() !== topic.name) saveTopic(topic.id, { name: name.trim() })
        onClose()
      }}
    >
      <DialogTitle>Edit topic</DialogTitle>
      <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10 text-base md:text-sm" autoFocus />
      {confirm && (
        <p className="text-sm text-muted-foreground">
          Its {inTopic.length} task{inTopic.length === 1 ? "" : "s"} will stay, without a topic.
        </p>
      )}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="destructive"
          onClick={() => {
            if (!confirm && inTopic.length) return setConfirm(true)
            for (const t of inTopic) saveTask(t.id, { topicId: null })
            saveTopic(topic.id, { deleted: true })
            onDeleted()
          }}
        >
          <Trash2Icon />
          {confirm ? "Delete anyway" : "Delete topic"}
        </Button>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}

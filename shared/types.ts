// Shared between the browser app and the Cloudflare Worker.
// All times are unix epoch milliseconds.

export type Task = {
  id: string
  title: string
  notes: string
  topicId: string | null
  /** For all-day tasks this is local midnight of the due day. */
  dueAt: number | null
  allDay: boolean
  important: boolean
  doneAt: number | null
  snoozedUntil: number | null
  createdAt: number
  updatedAt: number
  deleted: boolean
}

export type Topic = {
  id: string
  name: string
  color: TopicColor
  icon: TopicIcon
  position: number
  updatedAt: number
  deleted: boolean
}

// Order = order shown in the picker. New topics cycle through the first few.
export const TOPIC_COLORS = [
  "sky",
  "amber",
  "emerald",
  "violet",
  "rose",
  "orange",
  "teal",
  "blue",
  "lime",
  "indigo",
  "pink",
  "slate",
] as const
export type TopicColor = (typeof TOPIC_COLORS)[number]

// 30 common Lucide icons ("Circle" renders as the plain dot).
export const TOPIC_ICONS = [
  "Circle", "Briefcase", "GraduationCap", "BookOpen", "House", "Heart",
  "Dumbbell", "ShoppingCart", "Plane", "Car", "Code", "Laptop",
  "Music", "Camera", "Palette", "Wallet", "Calendar", "Star",
  "Flag", "Target", "Trophy", "Users", "PawPrint", "Utensils",
  "Coffee", "Leaf", "Wrench", "Gamepad2", "Lightbulb", "Rocket",
] as const
export type TopicIcon = (typeof TOPIC_ICONS)[number]

export type TaskPatch = Partial<Omit<Task, "id" | "updatedAt">>
export type TopicPatch = Partial<Omit<Topic, "id" | "updatedAt">>

export type SyncOp =
  | { t: "task"; id: string; patch: TaskPatch }
  | { t: "topic"; id: string; patch: TopicPatch }

export type SyncResponse = {
  tasks: Task[]
  topics: Topic[]
  /** Server time of this response; pass back as `since` next time. */
  now: number
}

export const VAPID_PUBLIC_KEY =
  "BBRm3w5fg1U-rfqekkfYSRaZREX7rqLbyV5WDZh1UzDxHuMcQG2r8CTvHCW-vmX6cLNcfj0ghixRnOCqqu_zRy0"

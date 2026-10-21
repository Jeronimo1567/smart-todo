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

/** User-adjustable settings, stored server-side (they drive the cron). */
export type Prefs = {
  /** Local hour reminders go quiet (0-23). Equal to quietEnd = no quiet hours. */
  quietStart: number
  quietEnd: number
  /** How often an overdue important task re-notifies. */
  nagMinutes: number
  digestEnabled: boolean
  /** "HH:mm" local */
  digestTime: string
  mcpEnabled: boolean
}

export const DEFAULT_PREFS: Prefs = {
  quietStart: 22,
  quietEnd: 8,
  nagMinutes: 60,
  digestEnabled: true,
  digestTime: "07:30",
  mcpEnabled: true,
}

export const NAG_OPTIONS = [30, 60, 120, 240] as const

/** An extra MCP URL for another app (e.g. Muse), with its own removable token. */
export type McpApp = { id: string; label: string; url: string }

export type SettingsResponse = Prefs & {
  timezone: string
  mcpUrl: string
  mcpApps: McpApp[]
  emailConfigured: boolean
  /** Where Clippy's Claude API key comes from, and its last 4 characters (never the key itself). */
  claudeKey: { source: "settings" | "secret"; last4: string } | null
}

/** A task Clippy (the AI helper) proposes; ids are made on the device. */
export type AiTask = Pick<Task, "title" | "topicId" | "dueAt" | "allDay" | "important" | "notes">
export type AiResponse = { message: string; tasks: AiTask[] }

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

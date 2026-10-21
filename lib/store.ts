"use client"

// Local-first store. Everything renders from memory (persisted to localStorage),
// edits apply instantly and are queued, then synced to the Worker in the background.
// Changes made elsewhere (other devices, Claude via MCP) arrive on focus / every 30s.

import { useSyncExternalStore } from "react"

import type { SyncOp, SyncResponse, Task, TaskPatch, Topic, TopicPatch } from "@/shared/types"

type State = {
  tasks: Record<string, Task>
  topics: Record<string, Topic>
  cursor: number
  /** null = unknown yet, false = needs login */
  authed: boolean | null
  hydrated: boolean
}

const KEY = "todo:v1"
const QUEUE_KEY = "todo:queue:v1"
const OVERLAP = 5_000 // re-read a few seconds back so no concurrent write is missed

const empty: State = { tasks: {}, topics: {}, cursor: -1, authed: null, hydrated: false }
let state: State = empty
let queue: SyncOp[] = []
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

function set(next: Partial<State>) {
  state = { ...state, ...next }
  emit()
}

let persistTimer: ReturnType<typeof setTimeout> | undefined
function persist() {
  clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    try {
      const { tasks, topics, cursor } = state
      localStorage.setItem(KEY, JSON.stringify({ tasks, topics, cursor }))
      localStorage.setItem(QUEUE_KEY, JSON.stringify(queue))
    } catch {}
  }, 50)
}

function hydrate() {
  if (state.hydrated || typeof window === "undefined") return
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null")
    queue = JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]")
    state = { ...state, ...(saved ?? {}), hydrated: true, authed: saved ? true : null }
  } catch {
    state = { ...state, hydrated: true }
  }
}

// ---------- server sync ----------

function merge(res: SyncResponse) {
  const tasks = { ...state.tasks }
  const topics = { ...state.topics }
  // Pending local edits win over what the server sent until they're flushed.
  const pending = new Map(queue.map((op) => [`${op.t}:${op.id}`, op.patch]))
  for (const t of res.tasks) {
    const p = pending.get(`task:${t.id}`)
    tasks[t.id] = p ? { ...t, ...(p as TaskPatch) } : t
  }
  for (const t of res.topics) {
    const p = pending.get(`topic:${t.id}`)
    topics[t.id] = p ? { ...t, ...(p as TopicPatch) } : t
  }
  for (const id in tasks) if (tasks[id].deleted) delete tasks[id]
  for (const id in topics) if (topics[id].deleted) delete topics[id]
  set({ tasks, topics, cursor: res.now - OVERLAP, authed: true })
  persist()
  syncTimezone()
}

let inflight: Promise<void> | null = null
let again = false
let sending = 0 // ops at the head of the queue currently on the wire

/** Push queued edits and pull remote changes in one round trip. */
export function sync(): Promise<void> {
  if (inflight) {
    again = true
    return inflight
  }
  inflight = (async () => {
    const ops = queue.slice()
    sending = ops.length
    try {
      const res = ops.length
        ? await fetch("/api/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ops, since: state.cursor }),
          })
        : await fetch(`/api/sync?since=${state.cursor}`, { cache: "no-store" })
      if (res.status === 401) return set({ authed: false })
      if (!res.ok) throw new Error(String(res.status))
      // Drop exactly the ops we sent; anything queued meanwhile stays.
      queue = queue.slice(ops.length)
      merge(await res.json())
    } catch {
      // offline or server hiccup: keep the queue, retry later
      setTimeout(() => sync(), 5_000)
    } finally {
      sending = 0
      inflight = null
      if (again) {
        again = false
        void sync()
      }
    }
  })()
  return inflight
}

let flushTimer: ReturnType<typeof setTimeout> | undefined
function enqueue(op: SyncOp) {
  // Coalesce edits to the same row (but never into an op already being sent).
  const i = queue.findIndex((q, idx) => idx >= sending && q.t === op.t && q.id === op.id)
  if (i >= 0) {
    queue[i] = { ...op, patch: { ...queue[i].patch, ...op.patch } } as SyncOp
  } else queue.push(op)
  persist()
  clearTimeout(flushTimer)
  flushTimer = setTimeout(sync, 150)
}

// ---------- mutations (instant) ----------

export function saveTask(id: string, patch: TaskPatch) {
  const now = Date.now()
  const prev = state.tasks[id]
  const next: Task = prev
    ? { ...prev, ...patch, updatedAt: now }
    : {
        id,
        title: "",
        notes: "",
        topicId: null,
        dueAt: null,
        allDay: false,
        important: false,
        doneAt: null,
        snoozedUntil: null,
        createdAt: now,
        deleted: false,
        ...patch,
        updatedAt: now,
      }
  const tasks = { ...state.tasks }
  if (next.deleted) delete tasks[id]
  else tasks[id] = next
  set({ tasks })
  enqueue({ t: "task", id, patch: prev ? patch : { ...next } })
}

export function addTask(patch: TaskPatch) {
  const id = crypto.randomUUID()
  saveTask(id, { createdAt: Date.now(), ...patch })
  return id
}

export function saveTopic(id: string, patch: TopicPatch) {
  const prev = state.topics[id]
  const next: Topic = {
    ...(prev ?? { id, name: "", color: "slate", icon: "Circle", position: Date.now(), deleted: false }),
    ...patch,
    updatedAt: Date.now(),
  }
  const topics = { ...state.topics }
  if (next.deleted) delete topics[id]
  else topics[id] = next
  set({ topics })
  enqueue({ t: "topic", id, patch: prev ? patch : { ...next } })
}

// ---------- auth ----------

export async function login(password: string) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  })
  if (!res.ok) return false
  set({ authed: true })
  await sync()
  return true
}

/** Sign out this device and forget its local copy. */
export async function logout() {
  await sync() // don't lose unsynced edits
  await fetch("/api/logout", { method: "POST" }).catch(() => {})
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith("todo:")) localStorage.removeItem(k)
  } catch {}
  location.reload()
}

// ---------- React binding ----------

let started = false
function start() {
  if (started) return
  started = true
  hydrate()
  void sync()
  const onVisible = () => document.visibilityState === "visible" && sync()
  document.addEventListener("visibilitychange", onVisible)
  window.addEventListener("focus", () => sync())
  window.addEventListener("online", () => sync())
  setInterval(() => document.visibilityState === "visible" && sync(), 30_000)
}

/** Tell the server our time zone so reminders and Claude use local time. */
function syncTimezone() {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
  if (localStorage.getItem("todo:tz") === tz) return
  fetch("/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ timezone: tz }),
  }).then((r) => r.ok && localStorage.setItem("todo:tz", tz))
}

function subscribe(l: () => void) {
  start()
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useStore() {
  return useSyncExternalStore(
    subscribe,
    () => {
      hydrate()
      return state
    },
    () => empty
  )
}

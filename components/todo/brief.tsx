"use client"

import { ListTodoIcon, PlayIcon, SettingsIcon, SparklesIcon, SquareIcon } from "lucide-react"
import { Fragment, useEffect, useMemo, useState } from "react"

import { briefRequest, briefToSpeech, partOfDay, useBrief } from "@/lib/brief"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"
import type { Task, Topic } from "@/shared/types"

export type TodayMode = "brief" | "list"

/** Muted sentence with the **emphasised** parts in the foreground colour. */
function Rich({ text }: { text: string }) {
  return (
    <>
      {text.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 ? (
          <span key={i} className="font-medium text-foreground">
            {part}
          </span>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  )
}

const GREETING = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" }

/** Today as a few calm sentences instead of a list. */
export function BriefView({
  open,
  all,
  topics,
  now,
  speaking,
  onSpeech,
}: {
  open: Task[]
  all: Task[]
  topics: Record<string, Topic>
  now: number
  speaking: boolean
  /** Hands the current text up so the Listen button can read it. */
  onSpeech: (text: string) => void
}) {
  const request = useMemo(() => briefRequest(open, all, topics, now), [open, all, topics, now])
  const brief = useBrief(request, true)
  const greeting = GREETING[partOfDay(now)]
  const speech = briefToSpeech(greeting, brief)
  useEffect(() => onSpeech(speech), [speech, onSpeech])

  return (
    <div className="mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-10 text-center text-[17px] leading-relaxed text-muted-foreground md:text-lg md:leading-relaxed">
      {/* Keyed on the text so a new wording fades in instead of jumping. */}
      <div key={speech} className={cn("animate-in duration-500 fade-in", speaking && "text-foreground/80")}>
        <h2 className="font-medium text-foreground">{greeting}</h2>
        <p>
          <Rich text={brief.status} />
        </p>
        <div className="my-12 flex flex-col gap-6 md:my-14">
          {brief.paragraphs.map((p, i) => (
            <p key={i} className="text-balance">
              <Rich text={p} />
            </p>
          ))}
        </div>
        <p className="font-medium text-foreground">{brief.closing}</p>
      </div>
    </div>
  )
}

/** Reads text aloud with the device's own voice. */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false)
  useEffect(() => () => window.speechSynthesis?.cancel(), [])
  const toggle = (text: string) => {
    const synth = window.speechSynthesis
    if (!synth) return
    if (speaking) {
      synth.cancel()
      return setSpeaking(false)
    }
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.95
    u.onend = u.onerror = () => setSpeaking(false)
    synth.cancel()
    synth.speak(u)
    setSpeaking(true)
  }
  return { speaking, toggle }
}

const ROUND =
  "flex size-12 items-center justify-center rounded-full bg-muted text-foreground/70 hover:text-foreground active:scale-95 [&_svg]:size-5"

/** Bottom bar on Today: settings, brief/list switch, Listen. */
export function TodayBar({
  mode,
  onMode,
  onOpenSettings,
  speaking,
  onListen,
}: {
  mode: TodayMode
  onMode: (m: TodayMode) => void
  onOpenSettings: () => void
  speaking: boolean
  onListen: () => void
}) {
  const seg = (m: TodayMode, label: string, icon: React.ReactNode) => (
    <button
      role="tab"
      aria-selected={mode === m}
      aria-label={label}
      title={label}
      onClick={() => {
        if (mode === m) return
        haptic("selection")
        onMode(m)
      }}
      className={cn(
        "flex h-10 w-12 items-center justify-center rounded-full text-muted-foreground transition-colors [&_svg]:size-5",
        mode === m ? "bg-background text-foreground shadow-sm" : "hover:text-foreground"
      )}
    >
      {icon}
    </button>
  )
  return (
    <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center px-5 pt-2 pb-[max(env(safe-area-inset-bottom),1rem)] md:px-8 md:pb-6">
      <div>
        <button onClick={onOpenSettings} aria-label="Settings" className={cn(ROUND, "md:hidden")}>
          <SettingsIcon />
        </button>
      </div>
      <div role="tablist" aria-label="Today view" className="flex rounded-full bg-muted p-1">
        {seg("brief", "Summary", <SparklesIcon />)}
        {seg("list", "List", <ListTodoIcon />)}
      </div>
      <div className="flex justify-end">
        {mode === "brief" && (
          <button
            onClick={() => {
              haptic("light")
              onListen()
            }}
            className="flex h-12 items-center gap-2 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground hover:bg-primary/85 active:scale-95 [&_svg]:size-4 [&_svg]:fill-current"
          >
            {speaking ? <SquareIcon /> : <PlayIcon />}
            {speaking ? "Stop" : "Listen"}
          </button>
        )}
      </div>
    </div>
  )
}

"use client"

import { ClockIcon } from "lucide-react"
import { useState } from "react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { haptic } from "@/lib/haptics"
import { cn } from "@/lib/utils"

const PRESETS = [
  { label: "9 AM", value: "09:00" },
  { label: "Noon", value: "12:00" },
  { label: "3 PM", value: "15:00" },
  { label: "6 PM", value: "18:00" },
  { label: "8 PM", value: "20:00" },
]
const MINUTES = [0, 15, 30, 45]

const pad = (n: number) => String(n).padStart(2, "0")

/** "HH:mm" -> "5:30 PM" */
export function formatTime(value: string) {
  const [h, m] = value.split(":").map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`
}

const cell =
  "flex h-10 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:h-8"
const on = "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"

/** Custom time picker. `value` is "HH:mm" (24h) or "" for no time. */
export function TimePicker({
  value,
  onChange,
  className,
}: {
  value: string
  onChange: (value: string) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [h24, m] = value ? value.split(":").map(Number) : [null, null]
  const hour12 = h24 === null ? null : h24 % 12 || 12
  const pm = h24 === null ? null : h24 >= 12

  function set(h: number, min: number) {
    haptic("selection")
    onChange(`${pad(h)}:${pad(min)}`)
  }
  // Picking an hour with nothing set yet guesses AM/PM the way people talk: 7–11 AM, 12–6 PM.
  function pickHour(h12: number) {
    const isPm = pm ?? (h12 === 12 || h12 <= 6)
    set((h12 % 12) + (isPm ? 12 : 0), m ?? 0)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className={cn("flex items-center gap-2 text-left", !value && "text-muted-foreground", className)}
        aria-label="Due time"
      >
        <span className="truncate">{value ? formatTime(value) : "Add time"}</span>
        <ClockIcon className="ml-auto size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 gap-0 p-3">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => {
                haptic("selection")
                onChange(p.value)
                setOpen(false)
              }}
              className={cn(
                "h-9 rounded-full border px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:h-7 md:text-xs",
                value === p.value && on
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <Separator className="my-3" />
        <div className="grid grid-cols-4 gap-1">
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <button key={h} type="button" onClick={() => pickHour(h)} className={cn(cell, hour12 === h && on)}>
              {h}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-4 gap-1">
          {MINUTES.map((min) => (
            <button
              key={min}
              type="button"
              onClick={() => set(h24 ?? 9, min)}
              className={cn(cell, m === min && h24 !== null && on)}
            >
              :{pad(min)}
            </button>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg bg-muted p-[3px]">
          {(["AM", "PM"] as const).map((label) => {
            const isPm = label === "PM"
            return (
              <button
                key={label}
                type="button"
                onClick={() => set(((h24 ?? 9) % 12) + (isPm ? 12 : 0), m ?? 0)}
                className={cn(
                  "h-9 rounded-md text-sm text-muted-foreground md:h-7",
                  pm === isPm && "bg-background text-foreground shadow-sm dark:bg-input/40"
                )}
              >
                {label}
              </button>
            )
          })}
        </div>
        <Separator className="my-3" />
        <div className="flex justify-between">
          <button
            type="button"
            onClick={() => {
              haptic("light")
              onChange("")
              setOpen(false)
            }}
            className="h-9 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground md:h-8"
          >
            No time
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="h-9 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground md:h-8"
          >
            Done
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

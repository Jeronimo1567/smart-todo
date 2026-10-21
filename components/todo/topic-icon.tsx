"use client"

import {
  BookOpenIcon,
  BriefcaseIcon,
  CalendarIcon,
  CameraIcon,
  CarIcon,
  CodeIcon,
  CoffeeIcon,
  DumbbellIcon,
  FlagIcon,
  Gamepad2Icon,
  GraduationCapIcon,
  HeartIcon,
  HouseIcon,
  LaptopIcon,
  LeafIcon,
  LightbulbIcon,
  type LucideIcon,
  MusicIcon,
  PaletteIcon,
  PawPrintIcon,
  PlaneIcon,
  RocketIcon,
  ShoppingCartIcon,
  StarIcon,
  TargetIcon,
  TrophyIcon,
  UsersIcon,
  UtensilsIcon,
  WalletIcon,
  WrenchIcon,
} from "lucide-react"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { DOT, TEXT } from "@/lib/format"
import { saveTopic } from "@/lib/store"
import { cn } from "@/lib/utils"
import { TOPIC_COLORS, TOPIC_ICONS, type Topic, type TopicIcon } from "@/shared/types"

// Explicit imports keep the bundle to just these 30 icons.
const GLYPHS: Record<Exclude<TopicIcon, "Circle">, LucideIcon> = {
  Briefcase: BriefcaseIcon,
  GraduationCap: GraduationCapIcon,
  BookOpen: BookOpenIcon,
  House: HouseIcon,
  Heart: HeartIcon,
  Dumbbell: DumbbellIcon,
  ShoppingCart: ShoppingCartIcon,
  Plane: PlaneIcon,
  Car: CarIcon,
  Code: CodeIcon,
  Laptop: LaptopIcon,
  Music: MusicIcon,
  Camera: CameraIcon,
  Palette: PaletteIcon,
  Wallet: WalletIcon,
  Calendar: CalendarIcon,
  Star: StarIcon,
  Flag: FlagIcon,
  Target: TargetIcon,
  Trophy: TrophyIcon,
  Users: UsersIcon,
  PawPrint: PawPrintIcon,
  Utensils: UtensilsIcon,
  Coffee: CoffeeIcon,
  Leaf: LeafIcon,
  Wrench: WrenchIcon,
  Gamepad2: Gamepad2Icon,
  Lightbulb: LightbulbIcon,
  Rocket: RocketIcon,
}

/** The topic's icon, tinted with its color. "Circle" is drawn as a plain dot. */
export function TopicGlyph({
  topic,
  className = "size-4",
  colored = true,
}: {
  topic: Pick<Topic, "icon" | "color">
  className?: string
  colored?: boolean
}) {
  if (topic.icon === "Circle" || !(topic.icon in GLYPHS)) {
    return (
      <span className={cn("flex shrink-0 items-center justify-center", className)}>
        <span className={cn("size-1/2 rounded-full", colored ? DOT[topic.color] : "bg-current")} />
      </span>
    )
  }
  const Glyph = GLYPHS[topic.icon as Exclude<TopicIcon, "Circle">]
  return <Glyph className={cn("shrink-0", colored && TEXT[topic.color], className)} />
}

/** Clicking the icon opens a picker; every choice saves instantly. */
export function TopicIconPicker({
  topic,
  className,
  glyphClassName,
}: {
  topic: Topic
  className?: string
  glyphClassName?: string
}) {
  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex items-center justify-center rounded outline-none hover:ring-2 hover:ring-ring/40 focus-visible:ring-2 focus-visible:ring-ring/60",
          className
        )}
        aria-label={`Change icon for ${topic.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <TopicGlyph topic={topic} className={glyphClassName ?? "size-5 md:size-4"} />
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={10}
        alignOffset={-10}
        className="w-[17rem] gap-0 p-3"
        // React bubbles portal clicks to the sidebar row; keep them here.
        onClick={(e) => e.stopPropagation()}
      >
        <div className="grid grid-cols-6 gap-2">
          {TOPIC_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => saveTopic(topic.id, { color: c })}
              className={cn(
                "size-6 rounded-full ring-offset-2 ring-offset-popover",
                DOT[c],
                topic.color === c && "ring-2 ring-foreground"
              )}
              aria-label={c}
              aria-pressed={topic.color === c}
            />
          ))}
        </div>
        <Separator className="my-3" />
        <div className="grid grid-cols-6 gap-1">
          {TOPIC_ICONS.map((i) => (
            <button
              key={i}
              onClick={() => saveTopic(topic.id, { icon: i })}
              className={cn(
                "flex size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground",
                topic.icon === i && cn("bg-muted", TEXT[topic.color])
              )}
              aria-label={i}
              aria-pressed={topic.icon === i}
            >
              <TopicGlyph topic={{ icon: i, color: topic.color }} colored={false} />
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

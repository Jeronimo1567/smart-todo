// 256 short, distinct, common words: an 8-word token carries 64 bits of randomness
// and is easy for people and AI assistants to copy without mistakes.
const WORDS = (
  "acid acorn actor adapt agent alarm album alert alien alpha amber angle ankle apple april arena " +
  "arrow aspen atlas audio awake bacon badge baker banjo baron basil beach beard berry bison blade " +
  "blank blaze bloom board boost brain brave bread brick bride brook brush cabin cable cactus camel " +
  "candy canoe cargo carol cedar chain chalk charm chess chief chili cider civic claim clerk cliff " +
  "clock cloud coach coast cobra comet coral crane crisp crown curve daisy dance delta denim depot " +
  "diary disco dizzy dodge dream drift drum eagle earth easel elbow ember empty epic equal fable " +
  "fairy falcon fancy feast fence ferry fiber field flame flute focus forge frost fruit gamma gecko " +
  "giant ginger glide globe grape gravy guava guest habit harbor hazel heart hedge honey hotel humor " +
  "igloo image index inlet ivory jelly jewel jolly judge juice kayak kebab koala label lemon lever " +
  "lilac linen llama lobby lotus lunar lyric magic mango maple march medal melon metal mocha model " +
  "moose motor mural music nacho navy nectar noble north novel oasis ocean olive omega opera orbit " +
  "otter oxide paddle panda paper pasta peach pearl pecan pedal piano pilot pixel plaza polar poppy " +
  "prism pulse quail quartz quest quill radar radio raven relay rhino ridge river robin rocket rodeo " +
  "royal rugby salad salsa satin sauce scout shark shell sheep sigma sloth snack solar sonic spark " +
  "spice squid stamp steam stone storm sugar sunny swamp syrup table tango tiger toast topaz torch " +
  "tower trail tulip tundra ultra umbra unity urban valve vapor velvet venus video vinyl viola zebra"
)
  .split(/\s+/)
  .filter(Boolean)

export function wordToken(count = 8) {
  const bytes = crypto.getRandomValues(new Uint8Array(count))
  return [...bytes].map((b) => WORDS[b % WORDS.length]).join("-")
}

export const WORD_COUNT = WORDS.length

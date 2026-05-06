# Clan Projectile Asset Prompts

Target files:

- Sprites: `public/nexus-assets/projectiles/clans/{slug}.png`
- ElevenLabs SFX: `public/nexus-assets/sounds/projectiles/{slug}-launch.mp3`
- ElevenLabs SFX: `public/nexus-assets/sounds/projectiles/{slug}-card-impact.mp3`
- ElevenLabs SFX: `public/nexus-assets/sounds/projectiles/{slug}-body-impact.mp3`
- Turn/UI SFX: `public/nexus-assets/sounds/ui/{event}.mp3`

ImageGen instruction shared by every row:

```text
Create one 64x64 source sprite for a 16x16 pixel-art game projectile. Center the projectile with generous padding. Use a perfectly flat #00ff00 chroma-key background for later background removal. The projectile itself must not contain #00ff00. No text, no watermark, no cast shadow, no floor, no frame. Crisp readable silhouette, high contrast, transparent-final asset style.
```

ImageGen spritesheet option:

```text
Create a 6 column x 4 row spritesheet on a perfectly flat #00ff00 chroma-key background. Each cell contains one centered 64x64 source sprite for a 16x16 pixel-art game projectile. Use the clan order from this document, left to right, top to bottom; leave the final unused cell empty #00ff00. Every projectile must have a distinct silhouette and color identity, no text, no watermark, no shadows, no grid lines. The projectile artwork itself must not contain #00ff00.
```

After a spritesheet is generated and saved locally, split it with:

```bash
bun scripts/split-projectile-spritesheet.mjs /path/to/projectile-spritesheet.png --cols=6 --size=16
```

## Animated projectile pipeline

ImageGen animation reference sheets are saved under:

```text
docs/generated-assets/projectile-animation-sources/batch-{1..4}.png
```

Each reference sheet is a 3-row loop: original, energized pulse, trailing pulse. The production game assets are not used directly from ImageGen because the generated frames can drift. Build final stable 3-frame strips from the ImageGen references plus the canonical 16x16 clan PNGs:

```bash
bun scripts/build-animated-projectiles.mjs
```

Outputs:

```text
public/nexus-assets/projectiles/clans/animated/{slug}.png
docs/generated-assets/projectile-animated-preview.png
```

Each animated `{slug}.png` is `192x64`, three `64x64` frames laid out horizontally. The 64px frames keep the richer ImageGen rendering for in-game scaling and previews; the static `16x16` PNGs remain as fallbacks. The build script aligns the three ImageGen frames by body anchor and then substitutes the full frame in the loop instead of drawing a fixed first-frame body over every frame.

ElevenLabs Sound Effects settings shared by every row:

- `model_id`: `eleven_text_to_sound_v2`
- `loop`: `false`
- `prompt_influence`: `0.75`
- `duration_seconds`: `0.5` for launch, `0.5` for card impact, `0.5` for body impact
- Keep each prompt as a one-shot game SFX, no music, no voice, no ambience bed, no long reverb tail.

## Turn/UI ElevenLabs prompts

`match-start.mp3`: `Short one-shot fantasy card battle start cue, low cinematic energy swell into a crisp battle-ready hit, polished mobile game UI, no music loop, no voice`

`round-start.mp3`: `Short one-shot new round cue, clean rising card-table shimmer into a tight snap, readable and not loud, polished mobile game UI, no music, no voice`

`player-turn.mp3`: `Short one-shot your-turn cue, positive bright card-game chime with a small ready tick, clear but subtle, no music, no voice`

`opponent-turn.mp3`: `Short one-shot opponent-turn cue, lower darker card-game tick with a small tense whoosh, clear but subtle, no music, no voice`

`player-move.mp3`: `Short one-shot player move confirm, confident card placement snap with tiny energy sparkle, polished mobile game UI, no music, no voice`

`opponent-move.mp3`: `Short one-shot opponent move reveal, darker card placement snap with small threat accent, polished mobile game UI, no music, no voice`

`victory.mp3`: `Short one-shot victory result cue, bright satisfying fantasy card-game flourish under one second, not a melody, no voice, no long tail`

`defeat.mp3`: `Short one-shot defeat result cue, low restrained card-game failure hit with fading ember, under one second, no voice, no long tail`

## [Da:Hack] / `dahack`

ImageGen: `neon terminal command shard, turquoise angular bracket bolt, tiny glitch pixels trailing behind it, cyber hacker energy`

Launch: `Short one-shot cyber projectile launch, tight digital whoosh with tiny terminal beeps and glitch ticks, turquoise hacker energy, fast and clean, no music, no voice`

Card impact: `Tiny cyber bolt hits a hard trading card surface, crisp plastic crack mixed with digital glitch spark and short error chirp, one-shot, no music, no voice`

Body impact: `Cyber bolt hits a body target, muted electric zap over a soft padded thud, brief digital static burst, one-shot, no music, no voice`

## Aliens / `aliens`

ImageGen: `small green plasma seed with alien eye silhouette in the glow, organic sci-fi slime rim, bright acidic core`

Launch: `Short alien plasma projectile launch, wet sci-fi pulse and elastic air whoosh, acidic green energy, one-shot, no music, no voice`

Card impact: `Alien plasma splats against a hard card surface, small wet sizzle with plastic tick and acidic spark, one-shot, no music, no voice`

Body impact: `Alien plasma hits a body target, wet organic slap plus brief acidic sizzle and soft thump, one-shot, no music, no voice`

## Alpha / `alpha`

ImageGen: `compact silver command chevron, military tactical dart with pale steel glow, disciplined geometric silhouette`

Launch: `Short tactical energy dart launch, clean compressed air snap with metallic servo click, disciplined military sci-fi, one-shot, no music, no voice`

Card impact: `Steel command dart hits a hard card, precise metallic tick and card-frame crack, controlled tactical impact, one-shot, no music, no voice`

Body impact: `Steel command dart hits a body target, blunt armor-padded thud with small metal ping, one-shot, no music, no voice`

## Chasers / `chasers`

ImageGen: `orange racing flare, comet-like pursuit marker with tire-spark tail, fast street chase silhouette`

Launch: `Fast racing projectile launch, tire squeal micro-scrape into a hot orange whoosh, chase-game energy, one-shot, no music, no voice`

Card impact: `Racing flare slams into a hard card, skid spark, plastic snap, tiny asphalt grit burst, one-shot, no music, no voice`

Body impact: `Racing flare hits a body target, fast slap-thud with hot road-spark crackle, one-shot, no music, no voice`

## Circus / `circus`

ImageGen: `magenta circus starburst juggling ball, striped carnival sparkle, playful but sharp projectile silhouette`

Launch: `Short carnival projectile launch, rubbery pop, tiny cymbal sparkle, fast magenta whoosh, playful but punchy, one-shot, no music, no voice`

Card impact: `Circus star projectile hits a hard card, toy-like clack, sparkle tick, quick plastic crack, one-shot, no music, no voice`

Body impact: `Circus star projectile hits a body target, rubber ball smack with soft thump and tiny jingle accent, one-shot, no music, no voice`

## Damned / `damned`

ImageGen: `violet cursed ember skull wisp, smoky demonic shard, dark occult flame with hard readable core`

Launch: `Short cursed projectile launch, dark smoky whoosh with low occult crackle and violet ember snap, one-shot, no music, no voice`

Card impact: `Cursed ember hits a hard card, dry bone crack, ash burst, brittle plastic snap, one-shot, no music, no voice`

Body impact: `Cursed ember hits a body target, heavy muted thud with ash hiss and low cursed burn, one-shot, no music, no voice`

## Deviants / `deviants`

ImageGen: `yellow-green unstable mutation spike, jagged toxic crystal with erratic glow, distorted silhouette`

Launch: `Short mutant projectile launch, unstable toxic fizz, crooked air rip, jagged electric sputter, one-shot, no music, no voice`

Card impact: `Mutant toxic spike hits a hard card, sharp crystal tick, corrosive fizz, plastic crack, one-shot, no music, no voice`

Body impact: `Mutant toxic spike hits a body target, sticky acidic slap with soft impact thud and fizz, one-shot, no music, no voice`

## Enigma / `enigma`

ImageGen: `purple puzzle-rune orb, faceted mystery glyph with spiral core, arcane logic projectile`

Launch: `Short enigma projectile launch, glassy arcane whoosh, puzzle click, soft reversed sparkle, one-shot, no music, no voice`

Card impact: `Purple rune orb hits a hard card, glass tick, puzzle-lock click, brief magic crackle, one-shot, no music, no voice`

Body impact: `Purple rune orb hits a body target, soft phase thud with crystalline shimmer and low magic pulse, one-shot, no music, no voice`

## Fury / `fury`

ImageGen: `red rage fire claw, compact flame slash with aggressive triangular silhouette, hot ember trail`

Launch: `Short fury projectile launch, violent flame whoosh with sharp claw swipe and ember burst, one-shot, no music, no voice`

Card impact: `Red flame claw hits a hard card, aggressive crack, scorched plastic snap, ember spit, one-shot, no music, no voice`

Body impact: `Red flame claw hits a body target, hot slap-thud with brief burn crackle and forceful punch, one-shot, no music, no voice`

## Gamblers / `gamblers`

ImageGen: `green casino chip projectile, tiny dice pip spark, spinning lucky coin silhouette`

Launch: `Short gambler projectile launch, spinning coin flick, dice rattle, fast green whoosh, one-shot, no music, no voice`

Card impact: `Casino chip hits a hard card, coin clack, dice tick, crisp plastic tap, one-shot, no music, no voice`

Body impact: `Casino chip hits a body target, flat coin slap with soft thud and tiny dice rattle, one-shot, no music, no voice`

## Kingpin / `kingpin`

ImageGen: `gold heavy crown slug, luxury brass projectile with diamond glint, authoritative compact shape`

Launch: `Short kingpin projectile launch, heavy gold coin whip, polished brass whoosh, expensive metallic snap, one-shot, no music, no voice`

Card impact: `Gold crown slug hits a hard card, heavy brass clack, card-frame crack, diamond sparkle tick, one-shot, no music, no voice`

Body impact: `Gold crown slug hits a body target, weighty padded thud with brass ring, one-shot, no music, no voice`

## Mafia / `mafia`

ImageGen: `crimson-black bullet rose, compact noir projectile with smoky red trail, elegant dangerous silhouette`

Launch: `Short mafia projectile launch, silenced pistol-like puff mixed with smoky red whoosh, noir and precise, one-shot, no music, no voice`

Card impact: `Noir bullet rose hits a hard card, suppressed tap, card crack, smoky ember tick, one-shot, no music, no voice`

Body impact: `Noir bullet rose hits a body target, muted punchy body thud with small smoky pop, one-shot, no music, no voice`

## Metropolis / `metropolis`

ImageGen: `teal city-energy bolt, miniature skyscraper shard with electric tram line glow, urban sci-fi projectile`

Launch: `Short metropolis projectile launch, electric rail zip, city power hum, teal air slice, one-shot, no music, no voice`

Card impact: `City-energy bolt hits a hard card, electric tick, glassy building crack, plastic snap, one-shot, no music, no voice`

Body impact: `City-energy bolt hits a body target, electric padded thud with short transformer buzz, one-shot, no music, no voice`

## Micron / `micron`

ImageGen: `blue microchip needle, tiny circuit spark projectile with precise pixel circuitry, miniature tech core`

Launch: `Short micron projectile launch, tiny circuit chirp, needle-fast blue laser whoosh, precise micro-tech snap, one-shot, no music, no voice`

Card impact: `Microchip needle hits a hard card, tiny laser tick, brittle circuit pop, plastic crack, one-shot, no music, no voice`

Body impact: `Microchip needle hits a body target, tiny electric prick over soft thud and brief circuit buzz, one-shot, no music, no voice`

## Nemos / `nemos`

ImageGen: `blue aquatic bubble spear, water-pressure droplet with fin-like shape, clean ocean projectile`

Launch: `Short aquatic projectile launch, pressurized water pop, bubble streak, quick wet whoosh, one-shot, no music, no voice`

Card impact: `Water spear hits a hard card, wet slap, plastic tap, small bubble burst, one-shot, no music, no voice`

Body impact: `Water spear hits a body target, wet body slap with soft thud and bubble pop, one-shot, no music, no voice`

## PSI / `psi`

ImageGen: `cyan psychic ring dart, telekinetic ripple projectile with eye-like center, clean mental energy`

Launch: `Short psychic projectile launch, telekinetic ripple whoosh, airy pressure pulse, cyan shimmer, one-shot, no music, no voice`

Card impact: `Psychic ring hits a hard card, sharp mind-pop, glassy tap, pressure crack, one-shot, no music, no voice`

Body impact: `Psychic ring hits a body target, soft telekinetic thump with inner-ear pressure pop, one-shot, no music, no voice`

## Saints / `saints`

ImageGen: `warm ivory holy spark, tiny halo spear with gold-white glow, clean sacred projectile`

Launch: `Short holy projectile launch, warm light whoosh, tiny bell shimmer, clean gold-white spark, one-shot, no music, no voice`

Card impact: `Holy spark hits a hard card, bright chime tick, card crack, tiny radiant burst, one-shot, no music, no voice`

Body impact: `Holy spark hits a body target, soft radiant thud with warm shimmer and small bell tick, one-shot, no music, no voice`

## Street / `street`

ImageGen: `pink graffiti spray dart, paint-splatter projectile with urban marker streak, rough street silhouette`

Launch: `Short street projectile launch, spray-can hiss into fast pink whoosh, rough urban snap, one-shot, no music, no voice`

Card impact: `Graffiti dart hits a hard card, paint splat, plastic crack, spray-can tick, one-shot, no music, no voice`

Body impact: `Graffiti dart hits a body target, wet paint slap with soft thud and short aerosol hiss, one-shot, no music, no voice`

## SymBio / `symbio`

ImageGen: `teal symbiotic tendril seed, organic biotech droplet with luminous vein core, living projectile`

Launch: `Short symbiotic projectile launch, organic tendril snap, wet biotech whoosh, teal pulse, one-shot, no music, no voice`

Card impact: `Symbiotic seed hits a hard card, sticky tap, chitin crack, wet electric sizzle, one-shot, no music, no voice`

Body impact: `Symbiotic seed hits a body target, sticky organic thud with wet tendril slap and low pulse, one-shot, no music, no voice`

## Toyz / `toyz`

ImageGen: `pink toy rocket bead, plastic candy projectile with tiny wind-up key glint, playful toy silhouette`

Launch: `Short toy projectile launch, spring-loaded pop, plastic whistle, tiny wind-up click, one-shot, no music, no voice`

Card impact: `Toy rocket bead hits a hard card, plastic clack, tiny squeak, card tap, one-shot, no music, no voice`

Body impact: `Toy rocket bead hits a body target, rubbery toy smack with soft thud and tiny squeak, one-shot, no music, no voice`

## Workers / `workers`

ImageGen: `orange industrial rivet bolt, hammer-spark projectile with metal shard silhouette, workshop heat glow`

Launch: `Short industrial projectile launch, pneumatic hammer puff, metal rivet shot, hot orange spark whoosh, one-shot, no music, no voice`

Card impact: `Industrial rivet hits a hard card, metal clang, plastic crack, workshop spark burst, one-shot, no music, no voice`

Body impact: `Industrial rivet hits a body target, heavy padded tool thud with short metal ring, one-shot, no music, no voice`

## Халифат / `caliphate`

ImageGen: `gold desert crescent ember, ornate sand-glass shard projectile with warm amber trail, disciplined silhouette`

Launch: `Short desert-gold projectile launch, sand hiss, curved blade air slice, warm amber spark, one-shot, no music, no voice`

Card impact: `Desert crescent ember hits a hard card, dry sand tick, ornate metal click, card crack, one-shot, no music, no voice`

Body impact: `Desert crescent ember hits a body target, dry padded thud with sand burst and warm metal tick, one-shot, no music, no voice`

## VibeCoders / `vibecoders`

ImageGen: `indigo code-vibe pulse, tiny bracket-shaped neon wave with modern software sparkle, clean digital projectile`

Launch: `Short coding-vibe projectile launch, modern UI click, soft synth-free digital whoosh, indigo pulse, one-shot, no music, no voice`

Card impact: `Code-vibe pulse hits a hard card, crisp UI error click, small glass tick, card crack, one-shot, no music, no voice`

Body impact: `Code-vibe pulse hits a body target, soft digital thud with tiny haptic click and low pulse, one-shot, no music, no voice`

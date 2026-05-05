# Nexus UI Redesign — 2026-05-04

Owner: Scrooge. Brief: existing UI читался как «нейрослоп» — слишком много золота, перегруженные экраны, всё одновременно. Решение: оставить эффекты и фон, дисциплинировать палитру, спрятать вторичную инфу в модалки/drawer'ы, одна основная задача на экран.

**Карты не трогаем** — `BattleCard`, `MiniBattleCard`, `MiniRevealBattleCard`, `ClanGlyph`, painted-frame ассеты остаются как есть. Меняем только окружение карт.

---

## Design tokens

### Палитра (одна на всё, без отступлений)

| token | hex | role |
|---|---|---|
| `--bg` | `#0d0e10` | основной фон |
| `--surface` | `#16181b` | панели, top bar |
| `--surface-raised` | `#1e2125` | модалки, drawer |
| `--ink` | `#f1ebd9` | основной текст |
| `--ink-mute` | `#8a8276` | вторичный текст, лейблы |
| `--accent` | `#f0c668` | золото — ТОЛЬКО primary CTA + ready/active state |
| `--accent-quiet` | `#6b5a31` | бордеры, hairline-разделители, hover |
| `--cool` | `#65d7e9` | ТОЛЬКО PvP CTA |
| `--danger` | `#d97056` | продажа, ошибки |

### Атмосфера

- **Background image:** `/nexus-assets/backgrounds/arena-bar-1024x576.png`, blur 12px, opacity 14%, поверх `--bg`. Везде кроме reveal-экрана.
- **Particles:** редкие тёплые точки света/пыли в воздухе (CSS, очень низкая плотность).
- **Никаких** drop-shadow на статичных панелях. Глубина — через разницу `--surface` ↔ `--surface-raised`.
- **Никаких** linear-gradient на панелях. Все панели = flat `--surface*`.
- **Никаких** text-shadow на статичных заголовках.

### Типографика

- Family: Geist Sans (уже подключен).
- Веса: regular для заголовков, medium для CTA, не black.
- Капс: только на лейблах <11px (gold-mute caps tracking 0.16em).
- Цифры: tabular-nums для счётчиков (Lv, кристали, статы).

### Поведение

- **Один режим = один экран.** Battle screen остаётся отдельной полноэкранной поверхностью.
- **Modals everywhere для деталей**: card details, deck preview, profile, booster details, settings.
- **Persistent thin top bar** ~44px (desktop) / 36px (mobile) на всех статичных экранах.
- **Floating chat bubble** bottom-right. Тап → drawer.
- **Card art untouched** — все мокапы, где видна карта, в реальном коде заменяются на существующий `BattleCard`.

### Инфраструктура

- Modal/Drawer: лёгкий примитив на нативном `<dialog>` + `::backdrop`. ~60 строк, A11y/ESC/focus бесплатно. Готовых нет (нет radix/headless-ui — не подключаем).
- Tailwind v4: токены через `@theme` в `globals.css`.

---

## Reference mockups

Все final-варианты сохранены в `./mockups/`. Каждое описание ниже содержит prompt, который воссоздаёт экран в том же визуальном языке.

| # | Screen | File |
|---|---|---|
| 03 | Top Bar (chrome) | `mockups/03-chrome-final.png` |
| 04 | Booster Catalog | `mockups/04-catalog-final.png` |
| 05 | Collection / Deck Builder | `mockups/05-collection-final.png` |
| 06 | Booster Detail Modal | `mockups/06-booster-detail-modal-final.png` |
| 07 | Booster Reveal | `mockups/07-booster-reveal-final.png` |
| 08 | Card Detail Modal | `mockups/08-card-detail-modal-final.png` |
| 09 | Deck Dock Modal | `mockups/09-deck-dock-modal-final.png` |
| 10 | Deck Ready (onboarding finale) | `mockups/10-deck-ready-final.png` |
| 11 | Profile Modal (slide-in) | `mockups/11-profile-modal-final.png` |
| 12 | Guide page | `mockups/12-guide-final.png` |

Rejected iterations (для контекста, не как target):
- `01-chrome-floating-rejected.png` — bar был с floating rounded inset, отказались в пользу edge-to-edge.
- `02-catalog-v1-saturated-glyphs-rejected.png` — глифы кланов были full-color, отказались в пользу desaturated.

---

## Common prompt header (paste at top of every screen prompt)

> Visual style anchors: deep matte charcoal background `#0d0e10` with a faint blurred painted dark cathedral arena visible behind at ~14% opacity (warm torch lights, vaulted columns, dust particles in the air). Typography: clean geometric sans-serif (Geist), regular weight on titles, NO text-shadow stamps, NO all-caps-black. Single accent: muted warm gold `#f0c668`, used ONLY on primary CTA buttons (filled, with dark text `#1a1408`) and on active-state markers. Quieter gold `#6b5a31` for hairline borders. Surfaces are flat — no linear gradients on panels, no per-panel drop-shadows. Mood: a calm, disciplined card-game UI like Slay the Spire crossed with Balatro. Discipline over decoration.

---

## Page prompts

### 1. Top Bar Chrome (final: `03-chrome-final.png`)

**Aspect:** 1440×44 desktop, 390×36 mobile. Edge-to-edge, no inset, no border radius, hairline 1px `--accent-quiet` divider at bottom.

**Layout (desktop):**
```
[ ◯ ИмяГравця · Lv 7 ] [ 💎 142 ] [ 🏆 1284 ] [ ............... ] [ ГРАТИ ]
   left cluster              center metrics                              right CTA
```

**Layout (mobile):** ◯ Им… · 7 · 💎 142 · [ГРАТИ] (truncate name; drop trophy)

**Image-gen prompt:**
> [Common header] Slim dark UI top bar, edge-to-edge, no rounded corners, no inset from screen edge, hairline gold-quiet divider at the bottom. Left cluster: 28px round avatar with a subtle gold-quiet ring, then a player name in warm parchment regular sans-serif "ИмяГравця", a thin vertical separator, then "Lv 7" in muted parchment. Center: a small minimalist crystal glyph and tabular "142", then a trophy glyph and tabular "1284" — monochrome line icons, never colored. Right edge: a primary call-to-action button "ГРАТИ" — FILLED warm muted gold `#f0c668` with DARK text `#1a1408`, capital letters at 12px, slight 1px gold border, no gradient, no glow, no shadow. Bottom-right corner of screen: a small floating chat bubble (52×52) with a chat glyph and number "3" in gold, also flat, no gradient. Whole bar feels like a Slay-the-Spire run-info strip — disciplined, calm, single accent.

---

### 2. Booster Catalog (final: `04-catalog-final.png`)

**Aspect:** 1440×900 desktop. Mobile variant: see Mobile Catalog below.

**Layout:**
```
─── TOP BAR ─────────────────────────────────────────────
                                                         
  Стартовий комплект                       Бустер 1 з 2
  Обери два бустери. У кожному 5 карт.                  

  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  
  │▍ NEON    │ │▍ FACTORY │ │▍ STREET  │ │▍ CARNIVAL│  
  │  BREACH  │ │  SHIFT   │ │  KINGS   │ │  VICE    │  
  │ ⚙  ▲    │ │ ⚒  ◆    │ │ ♛  ✦    │ │ ◯  ●    │  
  └──────────┘ └──────────┘ └──────────┘ └──────────┘  
  ... 4×3 grid of 12 identical tiles ...               
                                            ┌─────┐
                                            │ 💬 0│
                                            └─────┘
```

Selected tile: 1px `--accent` border. Hover: lift 1px + same border.

**Image-gen prompt:**
> [Common header] Calm dark UI catalog screen, 1440×900. Top: thin chrome bar (avatar, "Гість", crystal "0", muted gold "ГРАТИ" CTA — filled with dark text). Below: page heading "Стартовий комплект" in warm parchment off-white, regular weight, 32px, NO text-shadow, NO all-caps. Subtitle "Обери два бустери. У кожному 5 карт." in muted parchment gray. Right side of heading row: small status "Бустер 1 з 2" in muted gold. Main content: 4×3 grid of identical booster tiles, gap 16px, each tile ~280×140, surface `#16181b`, crisp 1px border `#2a2c30`, no gradient no glow no shadow. Inside each tile: a 2px vertical accent line on the LEFT in the booster's clan color (cyan/light-gray/purple/peach/yellow-green/green/cool-blue/purple/orange/blue/gold/red — one per tile, desaturated). Tile content: booster name in two lines of small caps warm parchment text top-left, two minimalist single-glyph clan icons at the bottom left in DESATURATED muted color (NOT in clan color — color comes only from the left line). NO story text, NO rarity counts, NO open button on the tile — the tile itself is the click target. One selected tile (NEON BREACH, top-left): 1.5px gold border `#f0c668`. Floating chat bubble bottom-right with "0".

---

### 3. Collection / Deck Builder (final: `05-collection-final.png`)

**Aspect:** 1440×900 desktop.

**Layout:**
```
─── TOP BAR ─────────────────────────────────────────────
─── DECK STRIP ──────────────────────────────────────────
Колода 8/8 ✓ готова ▸                                   

[Мої](База)  🔎 Пошук...    Фракція ▾  Рідкість ▾  Сорт ▾

┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐ ┌─┐
│ │ │ │ │ │ │ │ │ │ │ │ │ │ │ │  ← ~8 columns
└─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘ └─┘
... 3+ rows visible, scroll for more
              [ Показати ще · 32/214 ]
                                            ┌─────┐
                                            │ 💬 3│
                                            └─────┘
```

- Deck strip = single line, muted gold if 8/8, ink if <8. Tap → Deck Dock Modal.
- Filter chips: `Фракція ▾` etc — minimal text + chevron, no pill background.
- Card grid: cards float on `--bg`, no per-card panel chrome, gap 10px.
- In-deck cards: small `1`-`8` gold corner badge top-right (ONLY the 8 in deck, NOT all cards).
- Owned-multiple: `×3` parchment tag bottom-left.
- Selected: 2px `--accent` ring around card.

**Image-gen prompt:**
> [Common header] A card collection screen, 1440×900, dark base with painted arena visible behind at 14%. Top: thin edge-to-edge chrome bar (avatar, "ИмяГравця · Lv 7", crystal "142", trophy "1284", filled gold "ГРАТИ" with dark text). Just below the chrome: a one-line deck-status strip "Колода 8/8 ✓ готова ▸" in warm muted gold with a chevron on the right, hairline divider below. Below: a single horizontal toolbar — left has a 2-pill segmented control "Мої / База" with the active pill in gold outline, center has a search input with a magnifier glyph and placeholder "Пошук…", right has three minimal dropdown chips "Фракція ▾ · Рідкість ▾ · Сорт ▾" in muted parchment, no pill background. NO panel borders around the toolbar. Below: a clean grid of painted playing cards, 8 columns × 3 rows visible, gap 10px, NO per-card glow, NO per-card panel chrome — the cards float on the dark base, separated by negative space alone. Each card is detailed full-color painted art (cyberpunk-fantasy portraits with stat circles and clan glyphs). ONE selected card has a 2px gold ring. ONLY the 8 cards currently in the deck show a small gold corner badge with their slot number 1-8 at top-right; all other cards show nothing in that corner. Each owned card has a small "×3" or "×2" parchment tag at bottom-left. NO right side panel, NO faction sidebar. Bottom: a centered ghost button "Показати ще · 32/214" in muted gold-quiet outline. Floating chat bubble bottom-right. Mood: a card collector's display drawer.

---

### 4. Booster Detail Modal (final: `06-booster-detail-modal-final.png`)

**Aspect:** modal 640×520 centered over dimmed catalog (backdrop dim ~70%).

**Layout:**
```
┌──────────────────────────────────────────────┐
│  NEON BREACH                            ✕   │
│  Зламники проти прибульців                  │
│  ──────────────────────────────             │
│  Зламники проти прибульців: вимикай умін…  │
│                                              │
│  ┌────────┐  ┌────────┐                    │
│  │   ⚙    │  │   ▲   │                    │
│  │ HACKERS│  │ ALIENS│                    │
│  │ Скидає │  │ Краде │                    │
│  └────────┘  └────────┘                    │
│                                              │
│  5 карт · 1 легендарна · 1 унікальна        │
│                              [ ВІДКРИТИ ]   │
└──────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] A centered dark UI modal over dimmed booster catalog backdrop (catalog visible at ~30% opacity behind), modal size 640×520, surface `#1e2125`, 12px radius, single 1px gold-quiet border `#6b5a31`, NO drop-shadow NO glow. Title "NEON BREACH" warm off-white at 24px regular. Subtitle below "Зламники проти прибульців" in muted parchment small caps. A thin hairline divider in dark gold-quiet. One paragraph of warm parchment body text describing the booster, ~3 lines, comfortable line-height. Below: two equal panels side-by-side with 1px gold-quiet borders — each `#16181b` with a single big monochrome line-art clan glyph at top (gear / triangle / etc — DESATURATED, NOT in clan color), clan name in small caps below, a one-line bonus description in muted parchment. Bottom row: muted parchment text "5 карт · 1 легендарна · 1 унікальна" centered. Bottom-right: a single primary CTA "ВІДКРИТИ" — filled gold `#f0c668` with dark text `#1a1408`. Top-right: a small "✕" close glyph in muted parchment. Mood: a museum-card placard.

---

### 5. Booster Reveal (final: `07-booster-reveal-final.png`)

**Aspect:** 1440×900 desktop.

**Layout:**
```
─── TOP BAR (slightly faded) ────────────────────────────

           ─── NEON BREACH · 3/5 ───

   ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
   │ C1 │ │ C2 │ │ C3 │ │ ?? │ │ ?? │
   └────┘ └────┘ └────┘ └────┘ └────┘
     ✓      ✓      ✓      ?     ?

              Далі  (appears after all 5)
```

**NOTE:** card art in mockup is illustrative — in real code these slots render the existing `BattleCard` component.

**Image-gen prompt:**
> [Common header] A booster reveal screen, 1440×900. Top: thin chrome bar dimmed slightly. Center: a small heading line "NEON BREACH · 3/5" in muted parchment with thin gold-quiet flanking horizontal lines extending to either side (museum chapter heading style). Below: a horizontal row of five card slots, gap 18px. Three on the left are revealed playing cards — full painted color, ornate cyberpunk-fantasy fronts. Two on the right are face-down placeholder rectangles in `#16181b` with thin 1px gold-quiet border, faint emboss, a small "?" centered, nothing else. A tiny "✓" or "?" badge under each slot in muted parchment. NO flying particles, NO glow rings, NO chromatic aberration — just the cards on a dark stage. Below the row, generous space, then a single muted gold ghost text button "Далі" (only when all 5 revealed). Mood: deliberate, low-noise, every reveal feels weighted.

---

### 6. Card Detail Modal (final: `08-card-detail-modal-final.png`)

**Aspect:** 760×560 modal centered over dimmed Collection.

**Layout:**
```
┌──────────────────────────────────────────────┐
│ ✕                                            │
│   ┌────────┐    BISTI                       │
│   │        │    Carnival Vice · Унікальна   │
│   │  full  │                                │
│   │  card  │    Сила      7.3               │
│   │  art   │    Урон      5.2               │
│   │        │    Здоров'я  4.8               │
│   │        │    ────────────────             │
│   │        │    Уміння: Стелс               │
│   │        │    Перші 2 ходи невидима…      │
│   │        │    Бонус клану: Контроль       │
│   │        │    -1 урону у противника…      │
│   └────────┘                                │
│   У вас: 3                                  │
│   [ В КОЛОДУ ]   [ ПРОДАТИ ЗА 12 💎 ]      │
└──────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] Centered dark modal 760×560 over dimmed collection backdrop, surface `#1e2125`, 16px radius, 1px gold-quiet border. Two-column layout. Left column 320px wide: a single large painted playing card (cyberpunk-fantasy portrait, ornate frame with stat circles top-corners, clan glyph at bottom). Right column: card name "BISTI" at 28px warm off-white regular, subtitle "Carnival Vice · Унікальна" in muted parchment small caps. Below, a stats block: three rows "Сила 7.3", "Урон 5.2", "Здоров'я 4.8" — labels muted parchment, numbers tabular monospace warm off-white right-aligned. A hairline divider in gold-quiet. Then "Уміння: Стелс" with one-line description in body parchment. Another small section "Бонус клану: Контроль" with one-line description. Bottom of modal: a small "У вас: 3" in muted gold left-aligned. Two action buttons aligned right: primary FILLED gold "В КОЛОДУ" `#f0c668` with dark text, and a danger outline "ПРОДАТИ ЗА 12 💎" in muted red `#d97056` outline with a small crystal glyph. Top-left close "✕". Mood: a museum card-tag — the card is the hero, the text is the placard.

---

### 7. Deck Dock Modal (final: `09-deck-dock-modal-final.png`)

**Aspect:** 1080×620 modal centered.

**Layout:**
```
┌────────────────────────────────────────────────────────┐
│  Колода · 8/8 готова                              ✕   │
│  Сила 58.2 · Урон 42.1 · 2 фракції                    │
│  ───────────────────────────────────                   │
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
│  │ 1⊖ │ │ 2⊖ │ │ 3⊖ │ │ 4⊖ │ │ 5⊖ │ │ 6⊖ │ │ 7⊖ │ │ 8⊖ │
│  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘
│  Зв'язки: ⚡ Hackers·Aliens (×3)  ✦ Carnival·Vice (×2)│
│                                                         │
│  [ Авто-добір ] [ Очистити ]    [ ГРАТИ ] [ ГРАТИ PvP ]│
└────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] Wide centered dark modal 1080×620 over dimmed collection, surface `#1e2125`, 16px radius, 1px gold-quiet border. Top heading: "Колода · 8/8 готова" warm off-white at 22px, then a small one-line subtitle of metrics "Сила 58.2 · Урон 42.1 · 2 фракції" in muted parchment with bullet separators. A hairline divider. Center: a single horizontal row of 8 painted playing cards, each ~110×165, gap 12px. Each card has a small numeric badge "1"-"8" in the top-left corner in gold, and a tiny "⊖" remove glyph at top-right. Below row, a "Зв'язки:" label in muted parchment followed by two synergy chips with thin gold-quiet borders: "⚡ Hackers·Aliens (×3)" and "✦ Carnival·Vice (×2)". Bottom row split: left side has two ghost buttons "Авто-добір" and "Очистити" in muted gold-quiet outline with parchment text; right side has primary FILLED gold "ГРАТИ" with dark text and a CYAN outline button "ГРАТИ PvP" in `#65d7e9`. Top-right close "✕". Mood: a deckbuilder's tray — focused, all 8 visible, no decoration competing.

---

### 8. Deck Ready (final: `10-deck-ready-final.png`)

**Aspect:** 1440×900 desktop. Onboarding finale.

**Layout:**
```
─── TOP BAR ─────────────────────────────────────────────

         Колода готова · 8 карт · 2 фракції

  ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐
  │ C1 │ │ C2 │ │ C3 │ │ C4 │ │ C5 │ │ C6 │ │ C7 │ │ C8 │
  └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘

              ┌────────────────────┐
              │   ГРАТИ З ШІ       │  ← single big primary
              └────────────────────┘

           PvP бій  ·  Редагувати колоду
              (two underlined text links)
```

**Image-gen prompt:**
> [Common header] A "deck ready" celebration screen, 1440×900. Top: thin chrome bar with player name "ИмяГравця · Lv 1" and crystals "5". Center one-line heading "Колода готова · 8 карт · 2 фракції" in warm off-white at 22px regular, no caps no shadow. Below: a single horizontal row of 8 painted playing cards centered, gap 12px, each ~120×170, full color (cyberpunk-fantasy art with stat circles and clan glyphs). Below the row, generous vertical space ~80px, then ONE big primary CTA "ГРАТИ З ШІ" — wide button (~360×56), FILLED gold `#f0c668` with dark text `#1a1408`, simple, no gradient, no glow. Below it, two secondary text-only links separated by a dot: "PvP бій · Редагувати колоду" in muted parchment with underline-on-hover. NO metric tiles, NO extra panels, NO second column, NO confetti. Mood: a quiet "you're set" moment.

---

### 9. Profile Modal (final: `11-profile-modal-final.png`)

**Aspect:** 520×620 right-aligned slide-in over dimmed Collection.

**Layout:**
```
┌────────────────────────────────────┐
│ ✕                                  │
│           ◯◯◯◯◯◯                  │
│            (96px)                  │
│         ИмяГравця                  │
│         Lv 7  ·  XP 1240/1800      │
│         ▰▰▰▰▰▰▰▱▱▱  68%            │
│  ──────────────────                │
│  💎  Кристали            142       │
│  🏆  ELO                1284       │
│  ⚔   Перемог             47       │
│  ⚐  Бустерів відкрито    12       │
│  ──────────────────                │
│  Онлайн зараз: 23                  │
│  [ Інструкція ] [ Налаштування ]   │
└────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] A right-aligned slide-in profile drawer over dimmed collection backdrop, drawer 520×620, anchored to right edge, surface `#1e2125`, 1px gold-quiet left border, no shadow. Top: large 96px round avatar centered with a thin gold-quiet ring, then player name "ИмяГравця" warm off-white 22px regular, subtitle "Lv 7 · XP 1240/1800" in muted parchment, then a thin progress bar in muted gold filled 68%. A hairline divider in gold-quiet. A small key-value list, four rows: "💎 Кристали 142", "🏆 ELO 1284", "⚔ Перемог 47", "⚐ Бустерів відкрито 12" — labels muted parchment with small line-art icons, values tabular warm off-white right-aligned. Another hairline divider. One line "Онлайн зараз: 23" in muted gold. Bottom: two equal ghost buttons "Інструкція" and "Налаштування" in muted gold-quiet outline. Top-left close "✕". Mood: a calm character sheet.

---

### 10. Guide Page (final: `12-guide-final.png`)

**Aspect:** 1440×900, max content width ~780px centered, sticky right-nav at desktop ≥1200.

**Layout:**
```
─── TOP BAR ─────────────────────────────────────────────

                 Як грати                  │ Як грати  ←
        Коротко про правила, карти…        │   Бій     ←
                                            │   Карти   
  БІЙ ──────────────────────────            │   Прогрес 
  Кожен бій — це протистояння двох…         │   Режими  
                                            │   Економіка
  КАРТИ ────────────────────────            │   Кланові 
  Карти мають характеристики…               │   Поради  
                                            │
  ПРОГРЕС ──────────────────────            │
  Перемагайте в боях…                       │
```

Active section in nav: gold text + 2px gold left bar marker.

**Image-gen prompt:**
> [Common header] A documentation reading page, 1440×900. Top: thin chrome bar. Centered single column max-width 780px. Page heading "Як грати" warm off-white 36px regular, NO caps NO text-shadow. Subtitle "Коротко про правила, карти і прогрес." in muted parchment. Stacked content sections — each section has a small caps section heading at top-left in muted gold (e.g. "БІЙ", "КАРТИ", "ПРОГРЕС") followed inline by a hairline gold-quiet rule extending to the right margin (museum chapter style), then 2-3 paragraphs of body parchment text in comfortable reading rhythm (16px, 1.55 line-height). NO section card fills, NO drop-shadow, NO inner glow — just the heading and the rule. Right side at desktop ≥1200: a sticky narrow nav of section anchors as plain text links in muted parchment, the current section in warm gold with a 2px gold LEFT bar marker beside it. Mood: a printed booklet on a dark table.

---

## Mobile screens (final mockups generated)

| # | Screen | File |
|---|---|---|
| 13 | Catalog mobile | `mockups/13-catalog-mobile-final.png` |
| 14 | Collection mobile | `mockups/14-collection-mobile-final.png` |
| 15 | Card Detail Modal mobile | `mockups/15-card-detail-modal-mobile-final.png` |

Notes from generated mobiles:
- Catalog mobile abbreviates long names to fit (FACT. SHIFT, CARNI. VICE, TOY FACT.) — implementation should do the same: truncate at boundary, or use smaller text, or wrap to 2 lines.
- Collection mobile uses 3 columns, gap ~6px. Filter row collapses 3 dropdowns into single ⚙ Фільтри button → bottom-sheet (TBD primitive).
- Card Detail Modal mobile: full-screen sheet, sticky bottom action bar with both buttons stacked (full-width). Title weight slightly bolder than desktop is acceptable for mobile readability.


Mobile breakpoint: 390×844 (Telegram WebApp standard). Telegram chrome above is the platform's responsibility — we render edge-to-edge below it.

### M1. Catalog mobile

**Layout:**
```
─── TOP BAR (36px) ──────
◯ Гість    💎 0   [ГРАТИ]

Стартовий комплект     1/2
Обери два бустери. У…

┌─────────┐ ┌─────────┐
│▍ NEON   │ │▍ FACT.  │
│  BREACH │ │  SHIFT  │
│ ⚙  ▲   │ │ ⚒  ◆   │
└─────────┘ └─────────┘
┌─────────┐ ┌─────────┐
│▍ STREET │ │▍ CARNI. │
... 2 cols × 6 rows
                  ┌───┐
                  │💬0│
                  └───┘
```

**Image-gen prompt:**
> [Common header] A mobile portrait UI catalog screen, 390×844, dark base with painted arena visible at 14%. Top: thin edge-to-edge chrome bar 36px tall — small 24px round avatar, "Гість" in warm parchment, a tiny crystal glyph and "0", and a primary FILLED gold "ГРАТИ" CTA on the right with dark text. Hairline divider below. Below: page heading "Стартовий комплект" in warm off-white at 22px regular, subtitle "Обери два бустери. У кожному 5 карт." in muted parchment (may wrap to 2 lines). Right: small "1/2" status in muted gold. Main content: a 2-column × 6-row grid of identical booster tiles, gap 10px, each tile ~180×130, surface `#16181b`, 1px border `#2a2c30`. Each tile: 2px vertical accent line on the LEFT in clan color (desaturated), booster name 2 lines small caps top-left, two DESATURATED monochrome clan glyphs at the bottom-left. NO buttons on tiles, NO story text, NO rarity counts. One selected tile has 1.5px gold border. Floating chat bubble (44×44) bottom-right with "0". Mood: same disciplined museum-display feel as the desktop catalog, just stacked into 2 columns.

---

### M2. Collection mobile

**Layout:**
```
─── TOP BAR (36px) ──────
◯ Им…  💎 142   [ГРАТИ]

Колода 8/8 ✓ ▸

[Мої](База)  🔎  ⚙Фільтри

┌──┐ ┌──┐ ┌──┐
│  │ │  │ │  │  ← 3 cols
└──┘ └──┘ └──┘
┌──┐ ┌──┐ ┌──┐
│  │ │  │ │  │
└──┘ └──┘ └──┘
... 5+ rows visible
   [ Показати ще ]
                  ┌───┐
                  │💬3│
                  └───┘
```

**Image-gen prompt:**
> [Common header] A mobile portrait card collection screen, 390×844, dark base with painted arena 14%. Top: thin edge-to-edge chrome bar 36px — small 24px avatar, truncated name "Им…", crystal "142", primary FILLED gold "ГРАТИ" with dark text. Hairline below. Just below chrome: a one-line strip "Колода 8/8 ✓ ▸" in warm muted gold with chevron, hairline below. Below: a compact toolbar — left has 2-pill segmented "Мої / База" with active in gold outline, center has a small magnifier-only search icon button, right has a small "⚙ Фільтри" button in muted parchment outline. NO chips visible — they live in a bottom-sheet behind the Фільтри button. Below: a clean grid of painted playing cards, 3 columns × 5 rows visible, gap 6px, each card ~115×155, full painted art (cyberpunk-fantasy portraits with stat circles). NO per-card panel chrome — cards float on dark base. ONE selected card with 2px gold ring. The 8 cards in deck show small gold corner badges with their slot numbers. Owned cards show "×3" parchment tag at bottom-left. Bottom: a centered ghost button "Показати ще · 32/214" in muted gold-quiet outline. Floating chat bubble (44×44) bottom-right with "3". Mood: a card collector's pocket display.

---

### M3. Card Detail Modal mobile

**Aspect:** full-screen bottom sheet (slides up to cover ~95% of viewport, leaves a small backdrop tap-to-close margin at top).

**Layout:**
```
─── (small backdrop strip, tap to close) ────
┌─────────────────────────────────┐
│ ✕                               │ ← sticky header
│                                 │
│        ┌──────────────┐         │
│        │              │         │
│        │   full       │         │
│        │   card       │         │
│        │   art        │         │
│        │              │         │
│        └──────────────┘         │
│                                 │
│  BISTI                          │
│  Carnival Vice · Унікальна      │
│                                 │
│  Сила      7.3                  │
│  Урон      5.2                  │
│  Здоров'я  4.8                  │
│  ─────────────                  │
│  Уміння: Стелс                  │
│  Перші 2 ходи невидима для…    │
│                                 │
│  Бонус клану: Контроль          │
│  -1 урону у противника на…     │
│                                 │
│  У вас: 3                       │
│  ─────────────                  │
│  [ В КОЛОДУ ]                   │ ← sticky footer
│  [ ПРОДАТИ ЗА 12 💎 ]           │
└─────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] A mobile portrait card-detail bottom sheet, 390×844. The sheet slides up from the bottom and covers ~95% of the viewport, leaving a small dark backdrop strip at top showing a hint of the dimmed collection behind (tap-to-close zone). Sheet surface `#1e2125`, 16px top corner radius only, NO border around the sides, NO shadow. Sticky header bar at top of sheet with a "✕" close glyph in muted parchment top-left. Below: a single large painted playing card centered, ~280px wide (cyberpunk-fantasy portrait with stat circles and clan glyph). Below card: card name "BISTI" warm off-white 24px regular, subtitle "Carnival Vice · Унікальна" muted parchment small caps. Stats block: three rows "Сила 7.3", "Урон 5.2", "Здоров'я 4.8" — labels muted parchment left-aligned, numbers tabular warm off-white right-aligned. Hairline divider. Section "Уміння: Стелс" with one-line body description. Section "Бонус клану: Контроль" with one-line body description. "У вас: 3" in muted gold. Sticky footer at bottom of sheet with two stacked full-width buttons: primary FILLED gold "В КОЛОДУ" with dark text on top, danger-outline "ПРОДАТИ ЗА 12 💎" below. Mood: focused single-screen view, no distractions.

---

## Implementation order (when coding starts)

1. **Tokens + Modal primitive** (`globals.css` `@theme`, `<Modal>` on native `<dialog>`)
2. **TopBar + LobbyBubble** primitives
3. **Onboarding flow** — Catalog, Booster Detail Modal, Reveal, Deck Ready
4. **Collection** — chrome + filter row + grid + Card Detail Modal + Deck Dock Modal
5. **Profile Modal**
6. **Guide page**
7. **Browser verification + tests** (existing `data-testid` must stay intact)

Cards untouched throughout — `BattleCard`, `MiniBattleCard`, `MiniRevealBattleCard`, `ClanGlyph`, painted-frame asset.

---

# Battle redesign — Phase 5 (TBD)

Reference style: **Hearthstone-style atmospheric framing on the Nexus cathedral background**, applied to the **existing Nexus battle mechanics** (4-card hand, 4 rounds, in-place card resolution).

**Battle mockup references in `./mockups/`:**

| # | File | Status |
|---|---|---|
| 16 | `16-battle-b1-rejected-wrong-mechanics.png` | rejected — wrong mechanics (5 rounds, 1 slot, 3 fanned cards) |
| 17 | `17-battle-old-reference-main-view.png` | OLD pre-redesign — for mechanics reference only (4+4 cards layout) |
| 18 | `18-battle-old-reference-card-pick-modal.png` | OLD pre-redesign — card-pick modal flow |
| 19 | `19-battle-old-reference-clash.png` | OLD pre-redesign — clash resolution moment |
| 20 | `20-battle-old-reference-opponent-turn.png` | OLD pre-redesign — opponent thinking + used cards |
| 21 | `21-battle-b1-desktop-final.png` | **B1 desktop final** ✓ |
| 22 | `22-battle-b1m-mobile-pre-color-fix.png` | rejected — bars wrong color (gold instead of green HP) and on offset two-line HUD |
| 23 | `23-battle-b1m-compact-final.png` | **B1m mobile compact final** ✓ — single-line HUD top+bottom, green HP `#6ba35f` + gold energy `#f0c668` aligned same baseline |
| 24 | `24-battle-b2-card-pick-no-opponent.png` | B2 v1 — clean layout but missing opponent card preview and "Сумарна атака" total |
| 25 | `25-battle-b2-card-pick-with-opponent-rejected-layout.png` | rejected — concept right (shows opponent card + Сумарна атака) but **opponent card too small/squeezed** vs player card; right info panel feels cramped |
| 26 | `26-battle-b2-card-pick-final.png` | **B2 desktop final** ✓ — equal-size cards + VS tag, 3-column action row (energy stepper / Сумарна атака "8" box / OK), no duplicate name/abilities |
| 27 | `27-battle-b3-clash-final.png` | **B3 desktop final** ✓ — clash resolution, two played cards centered with "БІЙ" headline, dashed-ghost slots in rows |
| 28 | `28-battle-b4-opponent-turn-final.png` | **B4 desktop final** ✓ — opponent thinking, used cards dimmed with ✓/✕ badges, "Суперник обирає відповідь ●●●" |
| 29 | (deleted — fabricated B5 selection-overlay screen, not a real game flow; the `SelectionOverlay.tsx` component IS the card-pick modal which is B2) |
| 30 | `30-battle-b6-victory-final.png` | **B6 desktop final** ✓ — ПЕРЕМОГА overlay, 96px gold-ringed avatar, rewards list, ГРАТИ ЩЕ + ДО КОЛЕКЦІЇ buttons |
| 31 | `31-battle-b7-defeat-final.png` | **B7 desktop final** ✓ — ПОРАЗКА overlay, danger-ringed avatar, dimmer atmosphere, РЕВАНШ + ДО КОЛЕКЦІЇ buttons |

OLD references (17-20) document the existing battle mechanics and flows — designs are intentionally being replaced, but the FLOWS (4 cards always visible, card-pick modal with energy spend, clash centered, used cards stay in row with badges) are the locked behavior the new visuals must support.

> **NOTES FOR IMPLEMENTATION AGENTS (locked feedback from owner, 2026-05-04):**
> 1. **HP bar must be GREEN** (muted green `#6ba35f` fill, dark-green rail `#1d2a1c`) — NOT gold.
> 2. **Energy bar stays GOLD** (`#f0c668` fill, dark-gold rail `#3a2f15`).
> 3. **HP and energy bars must be perfectly aligned on the SAME horizontal baseline** in each HUD strip — no two-line offset, no different vertical positions. Same height, same length, same y-center. Numerals beside each bar use tabular monospace and are vertically centered on the bars.
> 4. Cards on the field render with the existing `BattleCard` component — visuals unchanged. Only the surrounding chrome is new.
> 5. **Card-pick modal (B2) MUST show the opponent card preview** alongside player card with **EQUAL SIZE** (no shrinking the opponent card). A subtle "VS" tag sits between them. Below or beside both cards, a "СУМАРНА АТАКА" block shows the live total = base attack + spent energy (e.g. "8 = 7 база + 1 енергія"). The right-side info panel (energy stepper, boost button, abilities, OK button) sits BELOW the two cards in a single horizontal row, NOT squeezed into a third column. Modal grows wider rather than cramping vertically.

**Mechanics that the redesign MUST honour** (from `src/features/battle/model/constants.ts`):
- `BATTLE_HAND_SIZE = 4` — each player has 4 cards in hand, **all visible simultaneously**
- `MAX_ROUNDS = 4` — match is 4 rounds
- `MAX_HEALTH = 12`, `MAX_ENERGY = 12` — bars cap at 12
- `TURN_SECONDS = 75` — per-turn timer
- Cards are played **in their hand position** — no separate "play slot". After playing, the card stays where it was and gets a "used" overlay
- Card-pick is a **dedicated modal** with energy/damage spending UI + opponent's face-down "VS" placeholder (existing flow, kept as-is)
- Clash resolution slides both played cards to center for the "БІЙ" reveal animation, then returns them to their hand positions with win/loss indicators

**Layout (top → bottom, both AI and PvP):**
1. **Opponent HUD strip** — avatar, name, level/title (e.g. "Рівень 2 · Швидкий тиск"), turn-timer "75 СЕК", energy bar ⚡, HP bar, "КОЛОДИ" deck-preview button
2. **Opponent's 4 hand cards** — horizontal row, all face-up always, full-color painted; used cards stay in row, dimmed 50% with a small ✓/✕ badge in the corner
3. **Center action area** — status headline ("Твій хід" / "Хід суперника" / "Бій"), thinking-dots indicator for opponent, hints/tooltips
4. **Player's 4 hand cards** — same row treatment as opponent
5. **Player HUD strip** — round counter "РАУНД 2", energy ⚡ bar, player name, HP bar, mode-info badge

**Architecture decisions locked:**
- One unified frame for AI vs PvP. PvP gets additive chrome (real opponent avatar, ELO badge, connection indicator, chat icon), not a parallel UI.
- Cards on the field render with the existing `BattleCard` component, sized for hand-row display. We redesign the surrounding chrome, HUD strips, modals, animations, overlays.
- Atmospheric background ramps from 14% (static screens) to ~22% opacity in battle — cathedral more present, but cards are still hero.
- Particles intensify during clash moment (warm dust drift toward center where "БІЙ" headline appears).
- HP/energy bars: thin horizontal bars with tabular numerals. **HP bar: muted green** (e.g. `#6ba35f` filled, `#1d2a1c` rail). **Energy bar: muted gold** (`#f0c668` filled, `#3a2f15` rail). Both bars must be the **same height, same length, and rendered side-by-side on the SAME baseline** (no offset between HP/energy lines on either HUD strip — they sit in one horizontal row aligned to identical vertical center). Danger-red `#d97056` overlay segment appears on HP bar when HP is about to drop.
- Round counter: lives in player HUD strip ("РАУНД 2"), NOT floating in field. Optional dots `● ● ○ ○` next to it.
- Card hand: 4 cards in flat row (no fan), generous gap, hover lifts active card 6px, selected card has 2px gold ring.
- Used card state: same position in row, 50% opacity, slight desaturation, ✓ (won round) or ✕ (lost round) badge in top-right corner in muted gold/danger.
- Card-pick modal: dedicated overlay with selected-card preview, energy/damage spending controls, opponent's face-down "VS" card placeholder. Existing UX flow, redesigned chrome.
- Clash animation: both played cards slide from their hand positions toward center, "БІЙ" headline appears, brief pause, cards return to their hand positions with win/loss state applied. HP/energy bars update with delta animation.
- Match end: full-screen overlay with portrait, "Перемога" / "Поразка" headline, rewards block, action buttons.

**Common prompt header for all battle screens (paste at top of each):**

> Visual style: deep matte charcoal `#0d0e10` base. Painted dark cathedral arena visible behind at ~22% opacity, blurred 8px (LESS blur than static screens — more present), warm torchlight glow on stone columns, faint warm-dust particles drifting upward. Subtle vignette around the central action area like a focused stage. Typography clean geometric sans, regular weight, NO text-shadow stamps, NO all-caps-black, NO bevelled "arcade" gold lettering. Single accent muted gold `#f0c668` used ONLY on selected-card outline, primary CTA after match ends, and turn-active state badges. Quieter gold `#6b5a31` for HP/energy bar fills, hairlines, status indicator outlines. Cyan `#65d7e9` reserved exclusively for PvP-only chrome (opponent live indicator, chat icon, ELO badge). Danger red `#d97056` for HP loss deltas and defeat states only. Cards on the field are full-color painted ornate cyberpunk-fantasy art with stat circles, ability/bonus plates at bottom, clan glyph (preserve existing `BattleCard` visual exactly). Mood: a Hearthstone-style focused play table inside a dim cathedral, every card weighted, no chromatic flair, no glow rings, no neon. Atmospheric, not loud.

---

## B1. Battle main view — your turn (AI mode, round 1)

**Aspect:** 1440×900 desktop, primary battle workhorse.

**Layout (top → bottom, all 4 cards on each side ALWAYS visible in row):**
```
┌──────────────────────────────────────────────────────────────────┐
│ ⏳ 75 СЕК   ⚡ ▰▰▰▰▰▰▰▱▱▱ 12       ІСКРА РАННЕР      HP ▰▰▰▰▰▰▰ 12  КОЛОДИ │  ← opponent HUD (~64px)
│                                  Рівень 2 · Швидкий тиск                  │     (timer · energy · name · HP · deck btn)
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← OPPONENT'S 4 CARDS in row
│   │ Card │    │ Card │    │ Card │    │ Card │                  │     all face-up always, full-color painted
│   │  1   │    │  2   │    │  3   │    │  4   │                  │     ability/bonus plates visible
│   └──────┘    └──────┘    └──────┘    └──────┘                  │     (tooltip on hover)
│                                                                  │
│                                                                  │
│                       ТВІЙ ХІД                                   │  ← center action area
│       Обери бійця, вклади енергію й випусти його на арену.       │     (~140px tall vertical space)
│                                                                  │
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← PLAYER'S 4 CARDS in row
│   │ Card │    │ Card │    │ Card │    │ Card │                  │     same — all face-up always
│   │  1   │    │ [2] │←  │  3   │    │  4   │                  │     [2] = hovered/selected with gold ring + lift
│   └──────┘    └──────┘    └──────┘    └──────┘                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ РАУНД 1   ⚡ ▰▰▰▰▰▰▰▱▱▱ 12          ГРАВЕЦЬ        HP ▰▰▰▰▰▰▰ 12  AI / PvP │  ← player HUD (~64px)
└──────────────────────────────────────────────────────────────────┘
                                                                ✕ leave
```

**Image-gen prompt:**
> [Common header] Battle screen 1440×900. **Top HUD strip ~64px** on `bg-surface` with hairline `accent-quiet` divider below: left cluster has hourglass glyph + "75 СЕК" tabular timer in muted parchment, then a thin horizontal energy bar `⚡` in muted gold-quiet `#6b5a31` filled to 100% (12 of 12 segments shown as a thin bar). Center: opponent name "ІСКРА РАННЕР" warm off-white at 16px regular, with subtitle "Рівень 2 · Швидкий тиск" in muted parchment small caps below. Right cluster: HP bar in muted gold-quiet filled 100% with tabular "HP 12" beside it; further right a small "КОЛОДИ" ghost text button in muted parchment outline (opens deck preview). **Center action stage**: Two horizontal rows of 4 painted playing cards each (preserve existing `BattleCard` art — ornate frames with stat circles top, name in middle, ability/bonus plates at bottom). Top row = opponent's 4 cards, ALL face-up and active (NOT face-down). Bottom row = player's own 4 cards, ALL face-up, second-from-left card is hovered/selected with a 2px muted gold `#f0c668` outline and a 6px lift. Cards in each row have generous gap (~28px between cards), each card ~180×260. **Between the two rows**, vertical space ~140px tall serves as the action area: centered headline "ТВІЙ ХІД" in warm off-white at 36px regular weight (NOT bevelled, NOT bold-shouty — the older arcade-style yellow gradient is REMOVED), with a one-line subtitle "Обери бійця, вклади енергію й випусти його на арену." in muted parchment 14px below. **Bottom HUD strip ~64px** mirrors the top: left cluster has "РАУНД 1" small caps muted gold tabular and player energy bar `⚡ 12`. Center: "ГРАВЕЦЬ" name. Right cluster: HP bar with "HP 12" tabular, then a small mode-info badge "AI" muted gold ghost outline. Below the bottom HUD, a tiny ✕ leave glyph in muted parchment bottom-right corner. **Background**: cathedral arena visible at ~22% opacity, blurred 8px, warm torchlight glow, subtle vignette around the central card area focusing attention on the play stage. Faint warm-dust particles drifting upward. NO floating round indicator, NO empty dashed slots — cards play in their hand position. NO chat bubble (AI mode). Mood: focused tournament table inside a dim cathedral.

---

## B2. Battle — card-pick modal

**Aspect:** 1440×900. Modal overlays the battle field after player taps a card. Field dimmed 60%. **Modal is wide (~960×560)** to fit two equal-size cards on top + info row below.

**Layout:**
```
        (battle field below, dimmed 60%)

  ┌──────────────────────────────────────────────────────────────────────────┐
  │                                                                       ✕  │
  │      Твій боєць              VS              Проти                        │
  │   ┌──────────┐           ╔══════╗          ┌──────────┐                  │
  │   │  Player  │           ║  VS  ║          │ Opponent │                  │
  │   │   Card   │           ╚══════╝          │   Card   │                  │
  │   │   full   │            (sigil)          │   full   │                  │
  │   │   art    │                              │   art   │                  │
  │   │ EQUAL    │                              │  EQUAL  │                  │
  │   │  SIZE    │                              │  SIZE   │                  │
  │   └──────────┘                              └──────────┘                  │
  │                                                                          │
  │  ─────────────────────────────────────────────────────────────────────   │
  │                                                                          │
  │  GAMBLERS · Гвен                          СУМАРНА АТАКА                  │
  │                                                                          │
  │  Енергія для атаки                            ┌──────────┐               │
  │  [ − ]  [ 1 ]  [ + ]   залишок: 11           │    8     │ УРОН: 3       │
  │                                               └──────────┘               │
  │  [ +2 УРОНУ за 3 ⚡ ]                         7 база + 1 енергія          │
  │                                                                          │
  │  Лють: +5 атаки соп.                                                     │
  │  +2 енергії наступного бою                                    [  ОК  ]   │
  └──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] A wide card-pick modal **960×560** centered over the dimmed (60% darken) battle field. Modal surface `#1e2125`, 16px radius, 1px gold-quiet border, 32px inner padding. **Top half is the duel preview**: two painted playing cards rendered at **EXACTLY THE SAME SIZE** (~220×310 each) sitting side-by-side with ~140px gap between them, both face-up showing full art. Left card is the player's chosen card (preserve existing `BattleCard` art — e.g. "Гвен" GAMBLERS, stats 4/6, full character illustration). Right card is the opponent's revealed/known card (same `BattleCard` treatment — e.g. "Іскра Раннер" RUNNERS, 3/5). Above each card a tiny muted-parchment label: left "Твій боєць", right "Проти". **Between the two cards, dead-center, a compact "VS" sigil tag** — small rounded rectangle ~46×34 with `bg-surface-raised`, gold-quiet border, "VS" text muted gold `#f0c668` 18px small caps tracking-wider. NO arrow, NO chevrons, just the tag. Optionally a thin warm-dust streak passing horizontally through the VS tag. **Below both cards, a hairline gold-quiet divider spans the modal width.** **Bottom half is the action panel** organized as two columns sharing the modal width: LEFT column ~520px with clan label "GAMBLERS · Гвен" muted gold small caps line, then heading "Енергія для атаки" muted parchment small caps, then a horizontal stepper `[−] [ 1 ] [+]` with tabular numeric "1" between, dim "залишок: 11" right-of-stepper, and below it an OPTIONAL boost button "+2 УРОНУ за 3 ⚡" in muted gold-quiet ghost outline (calm secondary, NOT red). Then ability text "Лють: +5 атаки соп." and bonus "+2 енергії наступного бою" muted parchment 14px. RIGHT column ~340px contains a **prominent "СУМАРНА АТАКА" block**: small caps muted gold heading, then a large boxed numeric "8" inside a `bg-surface-raised` rounded rectangle with gold-quiet border (~140×80, "8" in warm off-white 56px tabular regular weight), and beside it "УРОН: 3" in tabular monospace. Below the box, a single fine-print line "7 база + 1 енергія" muted parchment 12px showing the formula. Bottom-right of the right column: primary FILLED gold "ОК" button (~120×44, dark text). Top-right of modal: tiny ✕ close. Behind the modal: dimmed and blurred battle field with the player's hand row peeking at bottom (the chosen card glowing gold-outlined in its slot). Mood: a tactical commit moment with FULL information — both fighters revealed, total damage telegraphed, calm and deliberate. NO cramped third column, NO shrunken opponent card, NO red panic colors.

---

## B3. Battle — clash resolution moment

**Aspect:** 1440×900. Both played cards slide into the center action area for the "БІЙ" reveal animation.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ ⏳ 75 СЕК   ⚡ ▰▰▰▰▰▰▰▱▱▱ 8       ІСКРА РАННЕР      HP ▰▰▰▰▰▰ 12  КОЛОДИ │  ← opponent HUD (energy dropped after spend)
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← opponent row, the played card has its frame
│   │ Card │    │ Card │    │ ░░░░ │    │ Card │                  │     dimmed/half-out (slid to center)
│   │  1   │    │  2   │    │ moved│    │  4   │                  │
│   └──────┘    └──────┘    └──────┘    └──────┘                  │
│                                                                  │
│              ┌──────────┐  ─── БІЙ ───  ┌──────────┐            │  ← TWO played cards centered + headline
│              │ Opponent │                 │  Player │            │     (cards lifted, slight tilt toward center)
│              │  Card    │   ✦ tiny       │   Card  │            │     small projectile sigil between them
│              │  full    │   sigil        │   full  │            │
│              │  art     │                 │   art   │            │
│              └──────────┘                 └──────────┘           │
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← player row, played card half-out (slid to center)
│   │ Card │    │ ░░░░ │    │ Card │    │ Card │                  │
│   │  1   │    │ moved│    │  3   │    │  4   │                  │
│   └──────┘    └──────┘    └──────┘    └──────┘                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ РАУНД 1   ⚡ ▰▰▰▰▰▰▱▱▱▱ 9          ГРАВЕЦЬ        HP ▰▰▰▰▰▰ 12  AI │
└──────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] Battle screen 1440×900, clash resolution moment. Same HUD strips as B1. Both rows of 4 cards still visible, but ONE card from each row is "out of place" — the slot it occupies in the row shows a faint dashed outline indicating "card has moved to center" (no full empty box, just a subtle ghost). **In the center action area** between the two rows: TWO painted playing cards, one from opponent (top-left) and one from player (top-right), positioned side-by-side with a small gap, each lifted 12px and tilted slightly toward each other (~3°). Both face-up showing full-color painted art. Between them, a horizontal headline "БІЙ" in warm muted gold `#f0c668` at 32px regular weight (NOT the old bevelled bright-yellow arcade style — flat clean type), with thin gold-quiet flanking hairlines extending left and right beyond the cards (museum chapter style). Between the two cards, a tiny geometric sigil ✦ (~30×30) in muted gold representing the strike, with a faint warm-dust trail. **Background**: cathedral atmosphere ~28% opacity (slightly more present during action), warm light intensifying near the center. Particles converge subtly toward the central sigil. The opponent's HP bar shows a small danger-red `#d97056` overlay segment indicating HP about to drop. Player and opponent HUD strips remain readable but slightly dimmed. Mood: the climactic strike — weighty, focused, no neon flair.

---

## B4. Battle — opponent's turn (mid-match, some cards used)

**Aspect:** 1440×900. Round 2, both players have used some cards. Now opponent is thinking.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────┐
│ ⏳ 75 СЕК   ⚡ ▰▰▰▰▰▱▱▱▱▱ 5       ІСКРА РАННЕР      HP ▰▰▰▰▰▱ 9  КОЛОДИ │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← opponent row
│   │ Card │    │ Card │    │ Card │    │░░ ✓ ░│                  │     last card USED + ✓ (won that round)
│   │  1   │    │  2   │    │  3   │    │ used │                  │     dimmed 50%, desaturated
│   └──────┘    └──────┘    └──────┘    └──────┘                  │
│                                                                  │
│                  ХІД СУПЕРНИКА                                   │  ← center action area
│              Суперник обирає відповідь ●●●                       │     (thinking dots animate)
│                                                                  │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐                  │  ← player row
│   │ Card │    │ Card │    │ Card │    │░░ ✕ ░│                  │     last card USED + ✕ (lost that round)
│   │  1   │    │  2   │    │  3   │    │ used │                  │     dimmed 50%, desaturated, danger-tinted ring
│   └──────┘    └──────┘    └──────┘    └──────┘                  │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│ РАУНД 2   ⚡ ▰▰▰▰▰▰▰▰▰▰ 12         ГРАВЕЦЬ        HP ▰▰▰▰▱ 8   AI │
└──────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**
> [Common header] Battle screen 1440×900, opponent's turn during round 2. Same HUD/atmosphere as B1. Both card rows of 4 cards still visible. **In each row, the rightmost card is in the "used" state**: 50% opacity, desaturated to grayscale 30%, with a small badge in the top-right corner of that card — opponent's used card has a ✓ badge in muted gold `#f0c668` (won that round), player's used card has a ✕ badge in muted danger `#d97056` (lost that round). The other 3 cards in each row remain at full color and full opacity, available for the next round. **Center action area** between rows: headline "ХІД СУПЕРНИКА" warm off-white 32px regular weight, below it a smaller subtitle "Суперник обирає відповідь" in muted parchment 14px, followed by three animated dots `●●●` in muted gold (CSS pulsing one-after-another). HP bars now show partial fill (opponent 75% with HP 9, player 67% with HP 8). Round counter reads "РАУНД 2". Energy bars: opponent at 5 (recovered some after spend), player at 12 (max — hasn't acted yet). Cathedral atmosphere ~22%. Mood: a quiet pause while the opponent thinks — thinking dots are the only motion.

---

## B1m. Battle main view — your turn (mobile, 390×844)

**Aspect:** 390×844 portrait (Telegram WebApp standard). Same mechanics as B1 desktop — 4 cards per side, ALL face-up always, no fan, no empty slots — just scaled for narrow viewport.

**Layout:**
```
┌──────────────────────────────────────┐
│ ⏳75с  ⚡▰▰▰▰▱▱ 12     ІСКРА РАННЕР   │  ← opponent HUD (~44px)
│                       Рівень 2        │
│  HP ▰▰▰▰▰▰ 12              КОЛОДИ    │  ← second line: HP + deck btn
├──────────────────────────────────────┤
│                                      │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │  ← OPPONENT'S 4 CARDS in row
│ │card│ │card│ │card│ │card│         │     each ~84×118, gap 6px
│ │ 1  │ │ 2  │ │ 3  │ │ 4  │         │     simplified: art + stat circles
│ └────┘ └────┘ └────┘ └────┘         │     (no ability text — see CardPickModal)
│                                      │
│            ТВІЙ ХІД                  │  ← center action area (~80px)
│      Обери бійця й випусти          │     (subtitle shortened on mobile)
│         його на арену.               │
│                                      │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │  ← PLAYER'S 4 CARDS in row
│ │card│ │[card]│ │card│ │card│        │     middle card selected (gold ring + lift)
│ │ 1  │ │ 2   │ │ 3  │ │ 4  │        │
│ └────┘ └────┘ └────┘ └────┘         │
│                                      │
├──────────────────────────────────────┤
│ РАУНД 1   ⚡▰▰▰▰▰▰ 12       ГРАВЕЦЬ   │  ← player HUD (~44px)
│ HP ▰▰▰▰▰▰ 12                    AI   │  ← second line
└──────────────────────────────────────┘
                                ✕
```

**Image-gen prompt:**
> [Common header] Mobile portrait battle screen 390×844. **Top HUD strip ~44px** on `bg-surface` with hairline `accent-quiet` divider below. The strip uses TWO compact lines (mobile is too narrow for one): line 1 has timer "⏳75с" left, energy bar `⚡▰▰▰▰▱▱ 12` middle, opponent name "ІСКРА РАННЕР" right (truncate to fit); line 2: subtitle "Рівень 2" left in muted parchment small caps, HP bar `HP ▰▰▰▰▰▰ 12` center, "КОЛОДИ" small ghost button right in muted gold-quiet outline. **Card area**: opponent's 4 cards in a single horizontal row, each ~84×118px, gap 6px, cards centered in viewport with ~9px side padding. Each card shows the SIMPLIFIED display — preserve existing painted card art, the stat circles in top corners (e.g. "3" and "4"), clan glyph at top-center, name in middle (small caps text fits in 2 lines max), but the ability/bonus text plates at the bottom are HIDDEN on mobile to save space (the player taps a card to see full info in `CardPickModal`). Cards remain full-color always. **Center action area** (~80px tall): centered headline "ТВІЙ ХІД" warm off-white 24px regular weight (smaller than desktop's 36px), with a one-line subtitle "Обери бійця й випусти його на арену." in muted parchment 12px (text shortened for mobile vs the longer desktop string). **Player's 4 cards** in a horizontal row, same treatment as opponent's row, second card from left has 2px muted gold `#f0c668` outline and 4px lift (selected/hovered state). **Bottom HUD strip ~44px** mirrors top: line 1 has "РАУНД 1" small caps muted gold left, energy bar `⚡▰▰▰▰▰▰ 12` middle, name "ГРАВЕЦЬ" right; line 2: HP bar `HP ▰▰▰▰▰▰ 12` left, mode badge "AI" right in muted gold ghost outline. Bottom-right just below HUD: tiny ✕ leave glyph in muted parchment. **Background**: cathedral arena visible at ~22% opacity, blurred 8px, warm torchlight; subtle vignette around card area. NO ability text on cards (saved for modal), NO floating round indicator, NO empty slots. Mood: focused dueling table on a phone — every card readable at thumbnail size, tap any card to commit.

**Notes for implementation:**
- Card art readability at 84×118 is the tightest constraint. The existing `BattleCard` component uses container queries — verify at this width that stat circles, name, and clan glyph remain legible. If too tight, fall back to ability-text suppression (already in spec).
- Touch target: each card itself is the click target. 84×118 satisfies 44×44 min easily.
- The "AI" badge in player HUD is the same as desktop — for PvP mode it becomes a small cyan-outlined "PvP" badge.
- Top right corner just above the deck button might collide with Telegram's own header chrome — leave 8px breathing room.
- On landscape mobile (some users rotate for games), this layout naturally widens; cards can grow to ~140×195. But primary target = portrait.

---

## B1m-compact. Battle main view — mobile, single-line HUD

**Aspect:** 390×844. Same mechanics + corrected colors + tighter HUD: HP/energy bars on the SAME line, no two-row HUD, more vertical room for the play area.

**Layout:**
```
┌──────────────────────────────────────────────┐
│ ⏳75с  ⚡▰▰▰▰▱▱ 12  HP ▰▰▰▰▰▰ 12  ІСКРА РАННЕР │  ← opponent HUD: ONE line ~40px
│                                       КОЛОДИ │     (timer · ⚡ gold · HP green · name · deck btn)
├──────────────────────────────────────────────┤
│                                              │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                 │  ← OPPONENT'S 4 CARDS in row
│ │card│ │card│ │card│ │card│                 │     ~84×118 each
│ │ 3⚔4│ │ 2⚔3│ │ 4⚔6│ │ 3⚔5│                 │
│ └────┘ └────┘ └────┘ └────┘                 │
│                                              │
│              ТВІЙ ХІД                        │  ← center action area (~70px)
│      Обери бійця й випусти                   │     subtitle 1 line, smaller
│                                              │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐                 │  ← PLAYER'S 4 CARDS in row
│ │card│ │[2nd]│ │card│ │card│                 │     2nd selected (gold ring)
│ │ 3⚔4│ │ 4⚔6 │ │ 2⚔3│ │ 3⚔5│                 │
│ └────┘ └────┘ └────┘ └────┘                 │
│                                              │
├──────────────────────────────────────────────┤
│ РАУНД 1  ⚡▰▰▰▰▰▰ 12  HP ▰▰▰▰▰▰ 12  ГРАВЕЦЬ AI │  ← player HUD: ONE line ~40px
└──────────────────────────────────────────────┘
                                          ✕
```

**Image-gen prompt:**
> [Common header] Mobile portrait battle screen 390×844, COMPACT version. **Top HUD strip ~40px, ONE single horizontal line** on `bg-surface` with hairline `accent-quiet` divider below. The line packs everything tightly from left to right: hourglass + "75с" timer in muted parchment, then a thin energy bar in **muted gold `#f0c668`** rail-with-fill style (rail `#3a2f15`, filled to 100%) with tabular "12" right after, then a thin HP bar in **muted green `#6ba35f`** rail-with-fill (rail `#1d2a1c`, filled to 100%) with tabular "12" right after, then opponent name "ІСКРА РАННЕР" small caps warm off-white truncated to fit, finally "КОЛОДИ" tiny ghost button in muted gold-quiet outline at the right edge. **CRITICAL: the energy bar and HP bar must be IDENTICAL height (~6px), IDENTICAL length, and rendered on the EXACT SAME horizontal baseline** — they sit side-by-side in one row, not stacked. Numerals "12" are vertically centered on the bars. **Card area**: opponent's 4 painted cards in single horizontal row, each ~84×118px (preserve existing `BattleCard` art with stat circles, name, clan glyph; ability text plates HIDDEN on mobile to save space — full info shown in CardPickModal). Gap 6px between cards, ~9px side padding. **Center action area** ~70px tall (tighter than B1m): centered headline "ТВІЙ ХІД" warm off-white 22px regular weight, subtitle one line "Обери бійця й випусти" muted parchment 12px (single line on mobile, no wrapping). **Player's 4 cards** in horizontal row, same treatment as opponent's. Second card from left has 2px muted gold `#f0c668` outline + 4px lift (selected). **Bottom HUD strip ~40px, ONE single line** mirroring top: "РАУНД 1" small caps muted gold left, then energy bar gold + "12", then HP bar GREEN + "12", then "ГРАВЕЦЬ" name, then "AI" mode badge in tiny ghost outline at right edge. Bottom-right just below HUD: tiny ✕ leave glyph. **Background**: cathedral arena ~22% opacity, blurred 8px, warm torchlight, subtle vignette. NO two-line HUD anywhere — everything fits on single rows top and bottom for maximum vertical space for the cards. Mood: dense focused dueling table on phone — no wasted vertical pixels.

---

## B6. Battle — Match end · Victory

**Aspect:** 1440×900 full-screen overlay. Replaces battle view.

**Layout:**
```
                                        
                                          
         ┌──────┐     ПЕРЕМОГА             
         │@@@@@@│                          
         │ avatar│   Гравець                
         │ 96px │   проти AI Brawler       
         └──────┘                          
                                          
                                          
         ──── НАГОРОДИ ────                
         +120 XP  ·  +25 ELO               
         +50 ◆ кристалів                   
         +1 нова карта · UNDERWORLD        
                                          
                                          
              [ ГРАТИ ЩЕ ]   [ ДО КОЛЕКЦІЇ ]
```

**Image-gen prompt:**
> [Common header] Full-screen victory overlay 1440×900, replacing the battle view. Background: the cathedral arena at ~28% opacity (slightly more present than during play, with warm "sunrise" light coming through stained glass at the back, reinforcing victory mood). Center column. Top: 96px round player avatar with 1.5px gold ring and a subtle gold glow halo behind it. To the right of the avatar (or below on mobile): a heading "ПЕРЕМОГА" in warm off-white 48px regular weight (NOT bold), with subtle gold underline accent. Below: subtitle "Гравець · проти AI Brawler" in muted parchment small caps. Generous vertical space. Then a section heading "НАГОРОДИ" in small caps gold with hairline rule. A list of reward rows (each line, no panels): "+120 XP" with a small XP glyph, "+25 ELO" with trophy glyph, "+50 ◆ кристалів", "+1 нова карта · UNDERWORLD" — labels in muted parchment, values tabular in warm off-white. If a new card was gained, a small painted card preview to the right of that line. Generous space below. Two buttons centered: primary FILLED gold "ГРАТИ ЩЕ" with dark text, ghost outline "ДО КОЛЕКЦІЇ" in muted gold-quiet outline. Mood: a calm ceremonial finish — earned, not loud.

---

## B7. Battle — Match end · Defeat

**Aspect:** mirror of B6, defeat variant.

**Image-gen prompt:**
> [Common header] Full-screen defeat overlay 1440×900. Background: cathedral arena at ~24% opacity, dimmer than victory, warm light source dimmed, more shadow. Center column. Top: 96px round player avatar with a muted danger `#d97056` ring (NOT red-glow, just a tinted border). Heading "ПОРАЗКА" in warm off-white 48px regular weight, slightly muted (~85% opacity vs full ink). Subtitle "Гравець · проти AI Brawler". Section heading "РЕЗУЛЬТАТ" in small caps muted parchment. Reward rows: "+30 XP" (still some XP for playing), "−15 ELO" in muted danger, "+5 ◆ кристалів". NO new-card line on defeat. Two buttons centered: primary FILLED gold "РЕВАНШ" with dark text, ghost outline "ДО КОЛЕКЦІЇ". Mood: somber but not punishing — the cathedral acknowledges defeat without cruelty.

---

## B8. PvP-only chrome additions

**Aspect:** additive overlay on B1-B5 when match is PvP. Same battle layout, plus:

- Opponent strip: avatar slot now uses real opponent's Telegram photo (or default), name shows opponent's display name, "Lv X" + small ELO badge in cyan-tinted outline.
- Below opponent strip on the right: small **live indicator dot** (green pulse if opponent connected, amber if reconnecting, red+grey if disconnected). One-line text under: "Online" / "Reconnecting…" / "Disconnected — waiting".
- Top-right of viewport (above settings ⚙): a **chat icon** with unread count badge (cyan `#65d7e9` outline, count in cyan). Tap → opens battle-chat drawer (slides from right).
- Battle-chat drawer: same primitive as `LobbyChatDrawer`, just labeled "Чат бою" — re-uses Modal `drawer-right`.
- During a desync/disconnection: a non-blocking toast at top-center "Очікуємо суперника…" in cyan, fades in/out.

**Image-gen prompt:**
> [Common header] Same battle layout as B1, but PvP variant. Opponent strip: avatar is a stylized real-user portrait (not a generic enemy), opponent name "Andrii" warm off-white, "Lv 9" muted parchment, plus a small cyan-outlined ELO badge "ELO 1284". Just below opponent strip on the right edge: a small connection indicator — a tiny green pulsing dot with thin "Online" label in muted parchment. Top-right corner of viewport: a small chat icon (chat bubble glyph) in muted parchment outline with a tiny "2" badge in cyan indicating unread messages. The icon sits next to the ⚙ settings glyph. Everything else identical to B1: round counter, player strip, hand, slots. Mood: an opponent is present, but the chrome is calm — no glowing avatar, no shouty status.

---

## B9. PvP — matchmaking screen

**Aspect:** 1440×900 — appears when player taps "ГРАТИ PvP" and waits for opponent.

**Layout:**
```
                                        
              ─── ПОШУК СУПЕРНИКА ───      
                                          
                  [ spinning emblem ]      
              (subtle slow rotation)       
                                          
              Готова колода: 8 карт         
              ELO: 1284                    
                                          
              Знайдено: 12 онлайн          
              Час очікування: 0:23         
                                          
                                          
                ─── СКАСУВАТИ ───           
```

**Image-gen prompt:**
> [Common header] A matchmaking wait screen 1440×900. Cathedral arena visible at ~22%. Centered single column. Top: heading "ПОШУК СУПЕРНИКА" in warm off-white 24px regular with thin gold-quiet flanking hairlines. Below, generous vertical space. Center: a slowly rotating emblem in muted gold — a stylized geometric mark (e.g. a circle with three orbiting dots), about 80×80, slow continuous rotation (CSS animation, ~6s per rev). Below the emblem: two info lines in muted parchment small caps: "Готова колода: 8 карт" and "ELO: 1284". Below those: two more lines slightly smaller — "Знайдено: 12 онлайн" with a small green pulsing dot, and "Час очікування: 0:23" tabular. Generous space. Bottom-center: a single ghost text button "СКАСУВАТИ" in muted parchment with underline-on-hover. NO modal box. Mood: a calm waiting room, not anxious.

---

## Implementation order (Phase 5)

1. **Logic contracts** for `BattleGame`, `RealtimeBattleGame`, all `battle/ui/components/*` (subagent, read-only)
2. **Foundation extensions**: `BattleHudStrip` (timer/energy/name/HP/deck), `EnergyBar`, `HpBar` (with delta animation), `BattleHand` (4-card row with used overlay + win/loss badges), `CenterStage` (action area for status text + clash animation), `CardPickModal` (uses existing `<Modal>`)
3. **Screens (parallel agents):**
   - A. `BattleArena` (B1-B3 — main view + pick + attack)
   - B. `BattleResultBanner` + `MatchEndOverlay` (B4 + B6 + B7)
   - C. `SelectionOverlay` redesign (B5)
   - D. `PvPChromeAdditions` + `BattleChatDrawer` + `MatchmakingScreen` (B8 + B9)
4. **Integration**: rewire `BattleGame.tsx` and `RealtimeBattleGame.tsx` to use new arena components.
5. **Browser walkthrough** + Playwright e2e updates.

Cards (`BattleCard`) untouched throughout. Existing battle keyframes (`nexus-throw-*`, `nexus-projectile-spin`, etc.) can be reused or replaced with cleaner equivalents — agent's call per animation.

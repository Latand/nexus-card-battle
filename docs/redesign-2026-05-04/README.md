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

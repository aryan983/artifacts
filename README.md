# 🔬 FV Interview Prep — Formal Verification Flashcard Drill

A Windows XP-themed flashcard app for drilling formal verification concepts, SVA syntax, JasperGold TCL scripting, and senior-level FPV interview scenarios.

Built for engineers actively working in or preparing for formal verification roles.

---

## Live Demo

> Deploy `fv_flashcards_bundle.html` (renamed to `index.html`) to GitHub Pages or any static host.

---

## Features

### Flashcards
- **213 questions** across 18 categories covering the full FPV stack
- Spaced repetition — missed cards reappear 5 cards later, marked with ⟳
- Keyboard shortcuts: `Space` reveal · `1` Got It · `2` Missed · `3` Skip
- Shuffle toggle, progress bar, live session stats
- End-of-session score + missed question review drill
- Formatted answers — section headers, numbered lists, bullet points, inline code highlighting

### Learn Tab
Reference material across 7 sections, sidebar-navigated:
- SVA Operator Quick Reference
- JasperGold App Suite
- Abstraction Techniques
- Two-Phase FPV Methodology
- Common SVA Property Patterns
- FPV Debug Decision Tree
- Certitude & VC Formal (Synopsys)

### TCL Scripting Tab
JasperGold TCL reference across 8 sections:
- TCL Language Essentials (including `proc` deep-dive)
- Design Setup Commands
- Proof Commands
- Coverage App TCL
- Automation Patterns (full production script template)
- CDC App TCL
- Superlint App TCL
- Interview TCL Patterns

### UI
- Windows XP Luna theme — title bar gradient, bevelled borders, Tahoma font, XP progress bar
- Functional window controls — minimize, maximize, close, restore
- Start Menu with navigation shortcuts
- Desktop icon to reopen closed window
- Taskbar with live clock and app button
- Mobile responsive

---

## Question Categories

| Category | Count |
|---|---|
| Beginner | 25 |
| Intermediate | 25 |
| Advanced | 10 |
| Jasper Apps | 15 |
| Coverage | 10 |
| Coverage App | 10 |
| Mutation | 10 |
| Spot the Bug | 13 |
| Spot the Bug II | 8 |
| SVA Deep Dive | 10 |
| SVA Internals | 7 |
| Debug FPV | 10 |
| Abstraction | 10 |
| Interview Scenarios | 22 |
| Sign-off & Methodology | 8 |
| Hybrid Flows | 8 |
| CDC Formal | 6 |
| Liveness | 6 |
| **Total** | **213** |

---

## Usage

### Option A — Single file (recommended for GitHub Pages)
```
fv_flashcards_bundle.html   ← rename to index.html, deploy, done
```
No dependencies, no build step, no load order issues.

### Option B — Split files (recommended for local development)
```
index.html
style.css
questions.js
learn.js
tcl_ref.js
app.js
```
All 6 files must be in the same directory. Open `index.html` in a browser.

> **Note:** The split version will not work if opened directly from the filesystem on some browsers due to CORS restrictions on local `file://` script loading. Use a local server (`python3 -m http.server`) or use the bundle.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Reveal answer |
| `1` | Got It (correct) |
| `2` | Missed (card returns later) |
| `3` | Skip (card goes to end) |

---

## Spaced Repetition

Cards graded **Missed** (`2`) are re-inserted into the deck 5 positions ahead — not immediately, not at the end. They appear with a `⟳` marker in orange. Getting it right on the retry removes it permanently. Getting it wrong again re-queues it for another pass.

Cards graded **Skip** (`3`) move to the very end of the current deck.

---

## File Structure

```
fv_flashcards_bundle.html   Single-file bundle (use this for deployment)

index.html                  Shell HTML, tab layout, filter buttons
style.css                   XP Luna theme + all component styles
questions.js                ALL_QUESTIONS array (213 questions)
learn.js                    LEARN_SECTIONS reference content
tcl_ref.js                  TCL_SECTIONS reference content
app.js                      Deck engine, spaced repetition, tab switching,
                            answer formatter, window management, start menu
```

---

## Adding Questions

Open `questions.js` and append to `ALL_QUESTIONS`:

```javascript
ALL_QUESTIONS.push({
  id: 9999,
  diff: "Intermediate",        // filter category key
  cat: "Your Category Name",   // display label on card
  q: "Your question text",
  a: `Your answer.

Use blank lines to separate paragraphs.

1) Numbered items get blue badge styling
2) Automatically detected

Use backticks for \`inline_code\` highlighting.

ALL CAPS LINES BECOME SECTION HEADERS`
});
```

Valid `diff` values: `Beginner` `Intermediate` `Advanced` `Jasper` `Coverage` `CovApp` `Mutation` `Bug` `Bug2` `SVA_Deep` `SVA_Int` `Debug` `Abstraction` `Interview` `Methodology_Adv` `Hybrid` `CDC` `Liveness`

Remember to update the count on the corresponding filter button in `index.html` and regenerate the bundle if deploying.

---

## Answer Formatting

Answers are plain text with lightweight conventions the renderer picks up automatically:

| Convention | Renders as |
|---|---|
| Blank line between paragraphs | Paragraph break |
| `ALL CAPS SHORT LINE` | Blue XP section header pill |
| `1) item` or `1. item` | Numbered list with blue badge |
| `- item` or `• item` | Bullet list with ▸ marker |
| `` `code` `` | Inline code highlight |
| Multi-line SVA/SV code | Dark code block (auto-detected) |

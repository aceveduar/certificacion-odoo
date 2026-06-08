# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page exam-prep app for Odoo 19 functional certification ("Certificación Funcional Odoo 19"), used internally by Sunname. Plain HTML/CSS/JS — **no build tooling, no package.json, no bundler**. Three files do everything:

- `index.html` — markup, modal templates, Supabase client init
- `app.js` — all application logic (~1700 lines)
- `style.css` — all styling (~1800 lines)

Backend is **Supabase** (Postgres + Auth) accessed directly from the browser via `@supabase/supabase-js` (loaded from CDN in `index.html`). There is no server of our own.

## ⚠️ `app.js` is gitignored — do not assume git history covers it

`.gitignore` only allows `*.html`/`*.css`/`*.htm` (everything else is excluded by `*`). As a result **`app.js` — the file containing all the app's logic — is untracked** (`git status --ignored` shows it as `!!`), along with any `.md` files. `git log`/`git blame` will tell you nothing about `app.js` history. Before relying on git to understand recent changes to logic, check whether the relevant file is actually tracked (`git ls-files`).

## Commands

There's nothing to build, lint, bundle, or run a dev server for — open `index.html` directly in a browser (or serve the directory statically) and it works.

**No Node.js is available in this environment.** To syntax-check `app.js` after edits (there's no test suite), use this `osascript` pattern instead of `node -c`:

```bash
osascript -l JavaScript -e "
var content = \$.NSString.stringWithContentsOfFileEncodingError('$PWD/app.js', \$.NSUTF8StringEncoding, null).js;
try { new Function(content); console.log('OK'); } catch(e) { console.log('ERROR: ' + e); }
"
```

This only catches syntax errors (it never executes the code), but it's the fastest available signal before a manual browser check.

## Architecture

### Roles: auditor/admin vs. regular user

Everything editorial is gated behind two related flags:
- `isAdmin` — derived from `profiles.is_admin` at login (see Auth below); determines whether the 🔑 auditor button is even visible.
- `auditorMode` — whether the admin is currently *viewing* the editorial UI (toggled via `toggleAuditor()` / `setAuditorUI(active)`); admins can flip this off to preview exactly what a regular user sees, without logging out.

`setAuditorUI(active)` ([app.js](app.js)) is the single chokepoint that shows/hides every editorial control: the FAB to add questions, the sidebar filter sections (`#ssEstado`/`#ssRespuesta`/`#ssExamen`), the `🛠️` auditor-tools dropdown, drag-and-drop handles, answer-editing controls, etc. New editorial features should be wired through here, gated with `auditorMode` checks in `render()`, rather than introducing parallel visibility logic.

The inverse also exists: `.user-only` elements (e.g. the "Mi progreso" sidebar widget) are hidden specifically *for* auditors via the `auditor-active` class, toggled in the same function.

### Auth (Supabase Auth + `profiles` table)

Login is real email/password via `db.auth.signInWithPassword`. There's no public sign-up — accounts are created manually from the Supabase dashboard (Authentication → Users), then linked to a `profiles` row by hand. On `onAuthStateChange`, `enterAppWithSession(session)` looks up the user's row in `profiles` (`display_name`, `is_admin`) and sets `currentUser`/`isAdmin` accordingly — the display name and admin status live in Postgres, not in the JWT or `localStorage`. `profiles` intentionally has **no insert/update/delete RLS policies**, so a user can never self-promote to admin; profile rows are managed by hand in the Table Editor.

### The three study modes (`mode`: `'study' | 'practice' | 'exam'`)

`setMode(m)` ([app.js](app.js)) is the central mode-switch function — it toggles visibility of the timer bar, section-stats panel, shuffle button, exam setup screen, and various body classes, then calls `render()`. When adding mode-dependent UI, put the toggle here rather than scattering conditionals through `render()`.

Two important **body-class gates** drive CSS visibility across the whole layout:
- `exam-focus-active` — set while a user is actively taking a timed exam (hides nav/sidebar to prevent distraction/cheating)
- `exam-setup-browse` — set while a regular user is on the exam-setup screen, to hide the full question bank/sidebar/stats so they can't browse questions before committing to an exam

**Gotcha**: both classes must be cleared on every path out of their respective states (all `setMode` branches, `startExam`, `startModuleExam`). A past bug: `exam-setup-browse` was only cleared in the `study` branch of `setMode`, so switching Examen → Práctica left it stuck and blanked the whole practice view. The fix was to clear it unconditionally at the top of `setMode`, before the mode-branch chain — `renderExamSetup()` re-applies it correctly if/when the user actually lands on the exam setup screen.

### Exam types and `exam_configs`

Three distinct exam flows, all sharing the same timer/results/scoring machinery (`startTimer`, `submitExam`, `showExamResults`, `saveSession`):

1. **Simulacro de Examen** (`startExam`, admin-only) — 90 min over the whole bank or one "prueba" (Prueba 1/2/3)
2. **Examen por módulo** (`startModuleExam`, regular users) — scoped to one section, duration set per-module by the auditor
3. **🌐 Examen completo** (`startModuleExam` again, same function) — pools questions across *all* sections; represented as a sentinel row in `exam_configs` with `section = FULL_EXAM_SECTION` (`'__FULL__'`), so it reuses the exact same enable/duration/upsert machinery as a regular module without polluting `[...new Set(questions.map(q => q.section))]` (the real per-module list / bulk "select all" logic).

The auditor controls which of #2/#3 are available to regular users via the "⚙️ Exámenes por módulo" modal (`renderExamConfigList`/`toggleExamConfig`/`toggleAllExamConfigs`), which writes to the `exam_configs` table.

### Data model (Supabase tables, all accessed via `db.from(...)`)

| Table | Purpose |
|---|---|
| `preguntas` | The question bank: text, options, correct answer, section/module, assigned "prueba", review flags, sort order, audit metadata |
| `profiles` | `user_id` ↔ `display_name`/`is_admin`, RLS read-only (see Auth) |
| `exam_configs` | Which exams are enabled for regular users + duration; one row per real section plus the `__FULL__` sentinel |
| `practice_sessions` | Saved results of practice/exam runs (`user_name`, `mode`, `score_pct`, `section_scores` jsonb, etc.) — feeds "Mi progreso", the full progress modal, and the auditor's "🏆 Resultados por persona" |
| `activity_log` | Audit trail of editorial actions (who changed what, when) — feeds "🕐 Historial de actividad" |

`getFiltered()` is the single source of truth for "what question set applies right now" — it folds together `activeSection`, `searchTerm`, flag/answer/prueba filters, and mode. Exam pools, section stats, and session-saving all derive from it (or from equivalent direct `questions.filter(...)` calls when an exam needs a fixed pool independent of the user's current browsing filters).

### Rendering

`render()` ([app.js](app.js)) rebuilds the question list from scratch on every state change — there's no virtual DOM or diffing. It branches heavily on `mode` and `auditorMode` to decide what controls/badges appear per question card. If you're chasing a rendering bug, this function and `getFiltered()` are the two to read first.

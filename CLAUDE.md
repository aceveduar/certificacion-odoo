# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page exam-prep app for Odoo 19 functional certification ("Certificación Funcional Odoo 19"), used internally by Sunname. Plain HTML/CSS/JS — **no build tooling, no package.json, no bundler**. Three files do everything:

- `index.html` — markup, modal templates, Supabase client init
- `app.js` — all application logic (~1700 lines)
- `style.css` — all styling (~1800 lines)

Backend is **Supabase** (Postgres + Auth) accessed directly from the browser via `@supabase/supabase-js` (loaded from CDN in `index.html`). There is no server of our own.

## Tracking note

`.gitignore` allows `*.html`/`*.css`/`*.htm`/`*.js`/`*.sql`/`*.md`, so `app.js`, migration `.sql` files, and `.md` notes are all tracked — `git log`/`git blame` on `app.js` works. (This wasn't always true; if git history on a file looks suspiciously short, double-check `git ls-files` before assuming history is missing, rather than the reverse.)

## Commands

There's nothing to build, lint, bundle, or run a dev server for — open `index.html` directly in a browser (or serve the directory statically, e.g. `npx http-server -p 8080`) and it works.

Node.js has been available in every environment this has been run in so far. Syntax-check `app.js` after edits (there's no test suite) with:

```bash
node --check app.js
```

This only catches syntax errors (it never executes the code) — for actual behavior changes, serve the directory and drive it in a real browser (or headless via Playwright) rather than trusting the syntax check alone.

## Architecture

### Roles: auditor/admin vs. regular user

Everything editorial is gated behind two related flags:
- `isAdmin` — derived from `profiles.is_admin` at login (see Auth below); determines whether the 🔑 auditor button is even visible.
- `auditorMode` — whether the admin is currently *viewing* the editorial UI (toggled via `toggleAuditor()` / `setAuditorUI(active)`); admins can flip this off to preview exactly what a regular user sees, without logging out.

`setAuditorUI(active)` ([app.js](app.js)) is the single chokepoint that shows/hides every editorial control: the FAB to add questions, the sidebar filter sections (`#ssEstado`/`#ssRespuesta`/`#ssExamen`), the `🛠️` auditor-tools dropdown, drag-and-drop handles, answer-editing controls, etc. New editorial features should be wired through here, gated with `auditorMode` checks in `render()`, rather than introducing parallel visibility logic.

The inverse also exists: `.user-only` elements (e.g. the "Mi progreso" sidebar widget) are hidden specifically *for* auditors via the `auditor-active` class, toggled in the same function.

### Auth (Supabase Auth + `profiles` table)

Login is real email/password via `db.auth.signInWithPassword`. There's no public sign-up — accounts are created manually from the Supabase dashboard (Authentication → Users), then linked to a `profiles` row by hand. On `onAuthStateChange`, `enterAppWithSession(session)` looks up the user's row in `profiles` (`display_name`, `is_admin`) and sets `currentUser`/`isAdmin` accordingly — the display name and admin status live in Postgres, not in the JWT or `localStorage`. `profiles` intentionally has **no insert/update/delete RLS policies**, so a user can never self-promote to admin; profile rows are managed by hand in the Table Editor.

**RLS is enforced at the database level** (`migration_rls_lockdown.sql`), not just via the login screen: `preguntas`/`exam_configs` are readable by any authenticated user but only writable by admins (`profiles.is_admin`); `activity_log` is admin-only both ways; `practice_sessions` is insert/select-your-own-row-or-admin. Before this migration, the Supabase anon key alone (which is necessarily public — it's shipped in `app.js`) was enough to read and delete the entire question bank with no login at all. If you add a new table, it needs equivalent policies — don't assume the login screen is the security boundary, because it isn't; Postgres RLS is.

### Tracks: Consultor vs. Desarrollador (`preguntas.track`)

The bank holds two separate curricula that share the same table but must never mix: `track: 'consultor' | 'desarrollador'`. `activeTrack` ([app.js](app.js)) is set via the always-visible track switcher pinned above the sidebar (not a collapsible filter — it's a bigger decision than "Estado"/"Respuesta", so it isn't buried alongside them) and persisted to `localStorage` (`odoo_track`).

`buildSectionTabs()` derives the module tab list from `questions.filter(q => q.track === activeTrack)` and must be re-run (not just `render()`) whenever the set of sections-per-track could have changed — track switch, import, single-question save/delete, or a bulk-edit that changes `section`/`track`. `getFiltered()` applies `trackOk` unconditionally (unlike `pruebaOk`, which is an optional sidebar filter). Section names don't collide between tracks, so most track-scoping is just filtering `questions` by `track` before deriving section lists — the one place that genuinely needs it is the "🌐 Examen completo" pool (`startExam`, `startModuleExam`), which spans *all* sections and would otherwise mix both curricula's questions into one exam.

**Gotcha**: anywhere a question is created or its `section`/`track` is edited (`saveQuestion`, `deleteQuestion`, bulk-edit's "cambiar módulo/track" action), also call `buildSectionTabs()` — a new question with no `track` in its insert payload silently defaults to `consultor` at the DB level and vanishes from view if the auditor was browsing Desarrollador when they created it.

### The three study modes (`mode`: `'study' | 'practice' | 'exam'`)

`setMode(m)` ([app.js](app.js)) is the central mode-switch function — it toggles visibility of the timer bar, section-stats panel, shuffle button, exam setup screen, and various body classes, then calls `render()`. When adding mode-dependent UI, put the toggle here rather than scattering conditionals through `render()`.

Two important **body-class gates** drive CSS visibility across the whole layout:
- `exam-focus-active` — set while a user is actively taking a timed exam (hides nav/sidebar to prevent distraction/cheating)
- `exam-setup-browse` — set while a regular user is on the exam-setup screen, to hide the full question bank/sidebar/stats so they can't browse questions before committing to an exam

**Gotcha**: both classes must be cleared on every path out of their respective states (all `setMode` branches, `startExam`, `startModuleExam`). A past bug: `exam-setup-browse` was only cleared in the `study` branch of `setMode`, so switching Examen → Práctica left it stuck and blanked the whole practice view. The fix was to clear it unconditionally at the top of `setMode`, before the mode-branch chain — `renderExamSetup()` re-applies it correctly if/when the user actually lands on the exam setup screen.

**Estudio answers are hidden-by-default for regular users.** `auditorMode` always sees the correct option highlighted immediately (needed to review/flag content). A non-admin sees plain options plus a "👁 Ver respuesta" button per card; only after clicking it does that question join `studyRevealed` (a `Set` of question ids) and re-render with the answer shown — by design, so students research/reason instead of just scrolling past a pre-highlighted key. If you touch the option-rendering branch in `render()`, keep the `studyAnswerShown = auditorMode || studyRevealed.has(q.id)` gate; it's what the highlight, the `✓ Correcta` badge, *and* the reveal button's visibility all key off.

### Exam types and `exam_configs`

Three distinct exam flows, all sharing the same timer/results/scoring machinery (`startTimer`, `submitExam`, `showExamResults`, `saveSession`):

1. **Simulacro de Examen** (`startExam`, admin-only) — 90 min over the whole bank or one "prueba" (Prueba 1/2/3)
2. **Examen por módulo** (`startModuleExam`, regular users) — scoped to one section, duration set per-module by the auditor
3. **🌐 Examen completo** (`startModuleExam` again, same function) — pools questions across *all* sections; represented as a sentinel row in `exam_configs` with `section = FULL_EXAM_SECTION` (`'__FULL__'`), so it reuses the exact same enable/duration/upsert machinery as a regular module without polluting `[...new Set(questions.map(q => q.section))]` (the real per-module list / bulk "select all" logic).

The auditor controls which of #2/#3 are available to regular users via the "⚙️ Exámenes por módulo" modal (`renderExamConfigList`/`toggleExamConfig`/`toggleAllExamConfigs`), which writes to the `exam_configs` table. Rows are grouped by track in this modal (a section→track lookup via `getSectionTrack()`), independent of whatever track the auditor happens to have selected as their own browsing state.

`exam_configs.pool_size` (nullable int) optionally caps a configured exam to a random subset instead of the full section — e.g. 50-of-120 rather than all 120. `startModuleExam()` builds the full pool as before, shuffles it, then `.slice(0, cfg.pool_size)` if set; the resulting id list becomes `examPoolIds` (a `Set`), which `render()` intersects against *in addition to* the normal `getFiltered()` filters (`mode === 'exam' && examPoolIds`). This is the actual source of truth for "which questions are in this exam" — `activeSection`/`answerFilter` are only kept in sync for the rest of the UI (tabs, sidebar counts) to look coherent, they no longer do the real restricting on their own. (A prior version relied on `activeSection`/`answerFilter` alone for the full-exam case, which had a latent bug — `activeSection` was set to `null` there, and `secOk` never matches `null`, so the exam would have shown zero questions if `examPoolIds` weren't now doing the actual filtering.)

### Data model (Supabase tables, all accessed via `db.from(...)`)

| Table | Purpose |
|---|---|
| `preguntas` | The question bank: text, options, correct answer, section/module, `track` (`consultor`/`desarrollador`), assigned "prueba", review flags, sort order, audit metadata |
| `profiles` | `user_id` ↔ `display_name`/`is_admin`, RLS read-only (see Auth) |
| `exam_configs` | Which exams are enabled for regular users, duration, and optional `pool_size` cap; one row per real section plus the `__FULL__` sentinel |
| `practice_sessions` | Saved results of practice/exam runs (`user_name`, `mode`, `score_pct`, `section_scores` jsonb, etc.) — feeds "Mi progreso", the full progress modal, and the auditor's "🏆 Resultados por persona" |
| `activity_log` | Audit trail of editorial actions (who changed what, when) — feeds "🕐 Historial de actividad" |

`getFiltered()` is the single source of truth for "what question set applies right now" — it folds together `activeSection`, `searchTerm`, flag/answer/prueba/track filters, and mode. Exam pools, section stats, and session-saving all derive from it (or from equivalent direct `questions.filter(...)` calls when an exam needs a fixed pool independent of the user's current browsing filters).

### Bulk editing (`openBulkEditModal` / `confirmBulkAction`)

The "📋 Editar en lote" auditor tool is filter-then-act, not select-then-act: pick criteria (módulo/prueba/track/fecha de importación), see a live preview of what matches, then pick one action (eliminar / cambiar módulo / cambiar prueba / cambiar track / cambiar estado) to apply to the whole matched set. It's the same mechanism for every action — only the action-specific DB write and the local `questions` patch-in-place differ. **Deletes of 20+ rows require typing the exact count** (`BULK_DELETE_TYPED_CONFIRM_THRESHOLD`) instead of a plain `confirm()` — a filter as broad as "track only" already matches the whole track, and a reflexive click-through on a browser confirm dialog is not enough friction for that. If the action is "cambiar módulo", it also migrates that section's `exam_configs` row (duration/pool_size) to the new name — otherwise a renamed module's exam config silently orphans.

### Floating menus (auditor-tools dropdown, per-card "⋯" menu)

Both `#auditorToolsMenu` and the per-question `#cardActionsMenu` are moved to `document.body` and positioned with inline `top`/`left`/`right` (computed from the trigger button's `getBoundingClientRect()`) rather than living in-place with CSS `position: absolute`. This is deliberate: `.topbar-actions` scrolls horizontally on narrow screens, and any `overflow` on an ancestor clips an absolutely-positioned descendant, however the popover itself is positioned. Appending to `<body>` sidesteps that entirely.

**Gotcha**: because position is computed once at open time, not continuously, a floating menu left open through a page/container scroll drifts away from the button that opened it (the topbar is `position: sticky` and can visibly change position on scroll). Both menus are closed on any `scroll` event (`window.addEventListener('scroll', ..., true)`, capture phase so it also catches scrolling inside `.sidebar` or other internal containers) rather than repositioned — simpler and it's the common pattern for this kind of menu anyway. Follow the same close-on-scroll + body-append approach for any new floating menu.

### Rendering

`render()` ([app.js](app.js)) rebuilds the question list from scratch on every state change — there's no virtual DOM or diffing. It branches heavily on `mode` and `auditorMode` to decide what controls/badges appear per question card. If you're chasing a rendering bug, this function and `getFiltered()` are the two to read first.

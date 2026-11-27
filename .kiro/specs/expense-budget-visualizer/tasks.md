# Implementation Plan: Expense & Budget Visualizer

## Overview

A mobile-first, single-page web application for tracking daily personal spending, implemented entirely in three files (`index.html`, `css/style.css`, `js/app.js`) with no build step. The implementation proceeds from HTML scaffold, through CSS foundation and components, to the JavaScript state/rendering/event layers, ending with accessibility polish. Every task references the design document's sections and the requirements it implements.

## Tasks

- [x] 1. Create project scaffold (index.html, empty css/style.css, empty js/app.js)
  - [x] 1.1 Write complete `index.html`
    - Full semantic markup per the design's HTML structure: header with `#themeToggle` toggle switch, `#totalBalance` total card with always-present `#limitWarning` (aria-live), `#transactionForm` (with `#itemName`, `#itemAmount` number input `step="1" min="1" max="999999999"`, `#itemCategory` select, `#formErrors` aria-live), transactions card with `#sortSelect` (5 options) and `#transactionList`, chart card with `#chartContainer`, `#expenseChart` canvas (`role="img"`, `aria-label`), `#chartNoData`, `#chartFallback`, category manager (`#categoryInput`, `#addCategoryBtn`, `#categoryErrors`, `#categoryList`), `#limitInput`, `#monthSelect` + `#summaryBody`, `#toast` (`role="status"`) with `#toastMessage` and `#toastUndo`
    - Every input has an associated `<label for="…">`; form uses `novalidate`; number inputs use `inputmode="numeric"`
    - Chart.js CDN script (`https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js`, `defer`) loaded before `js/app.js` (also `defer`); relative paths `css/style.css` and `js/app.js`
    - _Requirements: R0, R1, R11, R12_

  - [x] 1.2 Create `css/style.css` and `js/app.js` as empty files
    - Create the `css/` and `js/` directories with empty placeholder files so later tasks only append
    - _Requirements: R0_

- [x] 2. Write CSS foundation (custom properties, base layout, responsive rules)
  - [x] 2.1 Write all of `css/style.css`: custom properties
    - `:root` light palette and `body.dark` overrides (`--bg`, `--surface`, `--text`, `--text-muted`, `--accent`, `--accent-contrast`, `--danger`, `--danger-soft`, `--border`, `--success`, `--shadow`), no raw colors elsewhere
    - _Requirements: R10, R12_

  - [x] 2.2 Write base layout, container, cards, breakpoints, hidden rule
    - Mobile-first base at 360px: `body` background/text transitions, `.container` (max-width 800px, grid, gap 16px), `.card` with surface/border/shadow transitions, `.list-header`, 16px base font, touch-friendly controls
    - Responsive breakpoints: 600px (two-column form rows, taller chart, row list-header) and 800px (two-column card grid with `grid-auto-flow: dense`, total and list span 2)
    - `[hidden] { display: none !important; }` rule
    - _Requirements: R10, R12, R4_

- [x] 3. Implement JS foundation: constants, state, storage, derived data
  - [x] 3.1 Write Section 1 (constants) and Section 2 (state variables)
    - `STORAGE_KEYS`, `DEFAULT_CATEGORIES`, `SORT_OPTIONS`, `CATEGORY_COLORS`, shared `idr` Intl formatter, `getCategoryColor(name)` (fixed slots for Food/Transport/Fun, hash for custom, using `Object.prototype.hasOwnProperty.call`)
    - Module-level `state`, `chart`, `chartAvailable`, `undoData`, `toastTimeoutId`, `selectedMonth`
    - _Requirements: R5, R6, R11_

  - [x] 3.2 Write Section 3 (storage helpers) and Section 4 (derived data)
    - `readJSON`/`writeJSON` with per-key try/catch; `loadState()` with full per-field transaction validation (id, name, amount integer ≥1, category, valid date), category defaults re-merge, limit/sort/theme sanitization, re-add categories used by surviving transactions; `saveTransactions`/`saveCategories`/`saveLimit`/`saveSort`/`saveTheme`
    - `getMonthKey` (local year/month), `getTotal`, `getSortedTransactions` (5 sort modes), `getDistinctMonths` (recent first), `getMonthTransactions`
    - _Requirements: R5, R6, R7, R8, R11_

- [x] 4. Implement JS rendering: total, list, categories
  - [x] 4.1 Implement `renderTotal()` and `renderList()`
    - `renderTotal()`: sum via `getTotal()`, IDR-formatted text in `#totalBalance`, `.over-limit` class when limit exceeded
    - `renderList()`: sorted rows with name, IDR amount, category, date, delete button (`data-id`, `aria-label` set via `setAttribute`), `.over-limit` row class when `tx.amount > state.limit`, empty-state `<li>` when no transactions; `textContent`/DOM properties only, never `innerHTML` for user data
    - _Requirements: R1, R2, R3, R9_

  - [x] 4.2 Implement `renderCategories()`
    - Render `#categoryList` chips with colored dot via `getCategoryColor(name)`; defaults never get delete button; custom category gets delete button only when zero associated transactions (case-insensitive check); repopulate `#itemCategory` options preserving current selection
    - _Requirements: R6_

- [x] 5. Implement JS rendering: chart
  - [x] 5.1 Implement `initChart()`
    - `typeof Chart === 'undefined'` guard sets `chartAvailable = false` and shows `#chartFallback` (hides `#chartNoData`); otherwise create one pie Chart instance with responsive, `maintainAspectRatio: false`, bottom legend with `getChartTextColor()`, IDR tooltip callback
    - _Requirements: R4, R11_

  - [x] 5.2 Implement `renderChart()`
    - Empty state: show `#chartNoData`, clear labels/data/backgroundColor arrays, `chart.update()`; never `display: none` the canvas
    - With data: hide overlay, aggregate per-category totals, set labels, data, `backgroundColor` via `getCategoryColor(name)` for each category, apply theme text/legend colors, `chart.update()`; no-ops when `!chartAvailable`
    - _Requirements: R4, R10_

- [x] 6. Implement JS rendering: limit and monthly summary
  - [x] 6.1 Implement `renderLimit()`
    - Null limit: hide `#limitProgress`, clear `#limitWarning.textContent`, remove red highlights; valid limit: show bar, fill width `Math.min(100, total/limit*100)%`, toggle `.over` on fill; over limit: warning text in always-present `#limitWarning`, `.over-limit` on total
    - _Requirements: R9_

  - [x] 6.2 Implement `renderMonthlySummary()`
    - Rebuild `#monthSelect` options from `getDistinctMonths()` with local-time labels (`toLocaleDateString('en-US', ...)`); restore `#monthSelect.value = selectedMonth`; default to most recent month when missing/invalid; empty state when no months; display total, count, per-category breakdown (sorted descending), top category (ties by amount then A–Z); all values via `textContent`
    - _Requirements: R7_

- [x] 7. Implement JS theme, render orchestration, and control restore
  - [x] 7.1 Implement theme helpers and `restoreControls()`
    - `getCSSColor`, `getChartTextColor`, `applyTheme()` (resolve `prefers-color-scheme` when unsaved, toggle `dark` class, set `#themeToggle.checked`, call `updateChartColors()`), `updateChartColors()` (guard `chartAvailable`)
    - `restoreControls()`: set `#sortSelect.value = state.sort` and `#limitInput.value = state.limit ?? ''`
    - _Requirements: R8, R9, R10_

  - [x] 7.2 Implement `render()` orchestration
    - Single `render()` calling `renderTotal`, `renderList`, `renderChart`, `renderLimit`, `renderMonthlySummary`, `renderCategories` in fixed order
    - _Requirements: R11_

- [x] 8. Implement JS toast, undo, and all event handlers
  - [x] 8.1 Implement `showToast`, `dismissToast`, `clearUndo`
    - Toast slides via `.visible` class; auto-dismiss 3s plain, 5s with Undo; `clearUndo` clears timeout and hides `#toastUndo`
    - _Requirements: R13_

  - [x] 8.2 Wire all event listeners inside single `DOMContentLoaded` handler
    - Form submit: trim name, validate amount (`Number.isInteger`, 1–999999999), inline errors in `#formErrors`, build `{ id: Date.now(), name, amount, category, date: new Date().toISOString() }`, push, save, reset form, `clearUndo()`, `render()`, toast
    - Delete via delegation on `#transactionList` (`button.delete-btn`, `data-id`), splice, save, set `undoData` with 5s timeout, `render()`, toast with Undo; Undo click: splice back at index, save, `clearUndo()`, `dismissToast()`, `render()`, toast
    - Sort change (update state, save, `renderList()`); limit input (integer + bounds, save, `render()`); month select change; add category (button click + Enter key in `#categoryInput`, trim, case-insensitive duplicate check, errors in `#categoryErrors`); delete category delegation (guard defaults and in-use); theme toggle `change` (toggle `dark` class, save, `updateChartColors()`, no full render)
    - Startup sequence: `loadState → applyTheme → initChart → restoreControls → render`
    - _Requirements: R1, R2, R5, R6, R8, R9, R10, R11, R13_

- [x] 9. Write CSS components: toggle, progress bar, toast, list, chart container, focus styles
  - [x] 9.1 Write component styles in `css/style.css`
    - Toggle switch (hidden input, track, sliding knob via `transform` transition, focus ring on `.toggle-track` via adjacent sibling selector)
    - Progress bar (`.limit-progress`, `.limit-progress-fill` with `.over` red), toast (fixed, slide-up transform, `.toast-undo`), transaction list (max-height 320px, `overflow-y: auto`, `.over-limit` row tint), `.total-balance` with `.over-limit` red, chart container (fixed height 280px, `position: relative`, absolute overlays)
    - Focus styles: `:where(a, button, input, select, [tabindex]):focus-visible` outline
    - _Requirements: R9, R10, R12, R13, R2, R4_

- [x] 10. Final polish and accessibility wiring
  - [x] 10.1 Add smooth transitions and verify accessibility attributes in `index.html`
    - Smooth CSS transitions for theme changes and list updates
    - Confirm `#formErrors`, `#categoryErrors`, `#limitWarning` have `aria-live="polite"`; `#limitWarning` present with no `hidden`; `#toast` has `role="status"`; `#expenseChart` canvas has `role="img"` and `aria-label`; `inputmode="numeric"` and bounds on number inputs; `novalidate` on form; delete buttons carry `aria-label`
    - _Requirements: R1, R2, R9, R12, R13_

## Notes

- Every task edits only `index.html`, `css/style.css`, or `js/app.js`; no other files are created or modified
- All requirements R0–R14 are covered: R0 (task 1), R1 (tasks 1, 8), R2 (tasks 4, 8, 9), R3 (task 4), R4 (tasks 1, 5, 9), R5 (tasks 3, 8), R6 (tasks 3, 4, 8), R7 (tasks 3, 6), R8 (tasks 3, 7, 8), R9 (tasks 4, 6, 7, 8, 9), R10 (tasks 2, 5, 7, 9), R11 (tasks 1, 3, 5, 7, 8), R12 (tasks 1, 2, 9, 10), R13 (tasks 8, 9, 10), R14 (all tasks use plain browser ES2017-level JavaScript)
- Per R0.5 this task list contains no optional, test, or checkpoint tasks
- Each JavaScript task implements the corresponding labeled section of the design document, building incrementally with no orphaned code — the final task wires the startup sequence and event handlers that integrate every component

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2"] },
    { "id": 2, "tasks": ["3.1", "3.2"] },
    { "id": 3, "tasks": ["4.1", "4.2"] },
    { "id": 4, "tasks": ["5.1", "5.2"] },
    { "id": 5, "tasks": ["6.1", "6.2"] },
    { "id": 6, "tasks": ["7.1", "7.2"] },
    { "id": 7, "tasks": ["8.1", "8.2"] },
    { "id": 8, "tasks": ["9.1"] },
    { "id": 9, "tasks": ["10.1"] }
  ]
}
```

# Requirements Document

## Introduction

A mobile-first web application for tracking daily personal spending. The app runs entirely in the browser with no backend — all data is stored in localStorage. It provides a transaction input form, a scrollable transaction list, a live total balance, a Chart.js pie chart of spending by category, a monthly summary view, sort controls, a spending limit with progress bar, custom categories, and a dark/light theme toggle. The entire implementation lives in three files: `index.html`, `css/style.css`, and `js/app.js`.

## Glossary

- **App**: The expense-budget-visualizer single-page web application.
- **Transaction**: A spending record with the shape `{ id, name, amount (Number), category, date (ISO string) }`.
- **Category**: A label that groups transactions (default values: Food, Transport, Fun).
- **Limit**: A user-defined overall spending ceiling (not monthly) stored in localStorage.
- **State**: The single in-memory object from which the App derives every rendered view.
- **render()**: The single function that redraws the transaction list, total balance, limit state, monthly summary, and pie chart from State.
- **Chart**: The Chart.js pie chart instance rendered inside `<canvas id="expenseChart">`.
- **Toast**: A short-lived non-blocking notification shown after add or delete actions.
- **Undo**: A short-lived action offered after a delete that restores the deleted Transaction for 5 seconds.
- **DOMContentLoaded**: The browser event after which all event listeners are attached.
- **localStorage**: The browser key-value store used for all persistence under the keys `transactions`, `categories`, `limit`, `sort`, and `theme`.

---

## Requirements

### Requirement 0: Project Scope and File Policy

**User Story:** As a developer, I want the project to stay within its defined file boundaries, so that the codebase remains simple and deployable without a build step.

#### Acceptance Criteria

1. THE project SHALL contain only three implementation files: `index.html`, `css/style.css`, and `js/app.js`, plus the `.kiro` spec files.
2. THE project SHALL NOT contain any test files, test folders, `package.json`, `node_modules`, extra JavaScript or CSS files, README, or configuration files beyond `.kiro`.
3. THE project SHALL NOT require any terminal command, build step, or package installation to run.
4. `design.md` SHALL NOT include Correctness Properties or a testing strategy section.
5. `tasks.md` SHALL contain only required implementation tasks; it SHALL NOT contain optional tasks (marked with *) or checkpoint tasks.

---

### Requirement 1: Transaction Input Form

**User Story:** As a user, I want to enter a transaction with a name, amount, and category, so that I can record my daily spending.

#### Acceptance Criteria

1. THE App SHALL provide a text input for Item Name, a number input for Amount, and a select input for Category.
2. THE Amount input SHALL accept whole numbers only (HTML attributes: `type="number"`, `step="1"`, `min="1"`).
3. THE App SHALL label every input element with a visible, associated `<label>` element.
4. WHEN the user submits the form with any field empty or with an Item Name that is blank after trimming whitespace, THE App SHALL display an inline error message for each invalid field and SHALL NOT add a transaction.
5. WHEN the user submits the form with an Amount of zero or below, THE App SHALL display an inline error message for the Amount field and SHALL NOT add a transaction.
6. WHEN the user submits a valid form, THE App SHALL add the transaction to State, persist it to localStorage under the key `transactions`, clear all form fields, and call render().
7. WHEN the user submits a valid form, THE App SHALL automatically set the transaction date to the current date and time (ISO string) without requiring user input.
8. THE App SHALL expose all error and warning messages via an `aria-live` region so assistive technologies announce them.

---

### Requirement 2: Transaction List

**User Story:** As a user, I want to see all my recorded transactions in a scrollable list, so that I can review my spending history.

#### Acceptance Criteria

1. THE App SHALL render every Transaction in State as a list row showing: item name, amount formatted in Indonesian Rupiah (id-ID locale, IDR currency, no decimal places), category, date, and a delete button.
2. THE App SHALL constrain the list to a fixed maximum height and make it vertically scrollable when the number of rows exceeds that height.
3. WHEN State contains no transactions, THE App SHALL display an empty-state message in place of the list.
4. WHEN the user clicks the delete button on a row, THE App SHALL remove that Transaction from State and localStorage, show a Toast, offer an Undo option for 5 seconds, and call render().
5. WHEN the user activates Undo within 5 seconds of a delete, THE App SHALL restore the deleted Transaction to State and localStorage and call render().
6. THE App SHALL use `textContent` (not `innerHTML`) when rendering any user-supplied value to prevent XSS.

---

### Requirement 3: Total Balance Display

**User Story:** As a user, I want to see my total spending at a glance, so that I always know how much I have spent.

#### Acceptance Criteria

1. THE App SHALL display the sum of all Transaction amounts formatted in Indonesian Rupiah at the top of the page.
2. THE App SHALL label the total display with the text "Total Balance".
3. WHEN any transaction is added or deleted, THE App SHALL update the total balance immediately without a page reload.

---

### Requirement 4: Pie Chart of Spending by Category

**User Story:** As a user, I want a visual breakdown of spending by category, so that I can understand where my money goes.

#### Acceptance Criteria

1. THE App SHALL render a pie chart using Chart.js inside a single `<canvas id="expenseChart">` element that is wrapped in a fixed-height container.
2. THE App SHALL create the Chart instance once on load and update it by mutating chart data and calling `chart.update()` on every render(); THE App SHALL NOT destroy and recreate the Chart instance on each update.
3. WHEN State contains no transactions, THE App SHALL keep the chart container at its fixed height, keep the `<canvas>` element present in the DOM, and overlay a "No data yet" message on top of the container; THE App SHALL NOT use `display: none` on the canvas element.
4. WHEN State contains transactions, THE App SHALL hide the overlay message and render the chart data inside the visible canvas.
5. WHEN Chart.js fails to load from the CDN, THE App SHALL display a friendly error message and SHALL continue operating without the chart.
6. WHEN the user changes the active theme, THE App SHALL update chart text and legend colors to remain readable against the new background.

---

### Requirement 5: Data Persistence

**User Story:** As a user, I want my data to survive page refreshes, so that I do not lose my records when I close or reload the app.

#### Acceptance Criteria

1. WHEN the page loads, THE App SHALL read `transactions`, `categories`, `limit`, `sort`, and `theme` from localStorage and initialize State from those values.
2. THE App SHALL wrap every localStorage read and write in a `try/catch` block and fall back to safe defaults when data is missing or corrupted.
3. WHEN the page is refreshed after transactions, categories, a limit, a sort preference, and a theme have been set, THE App SHALL restore all five values exactly as they were saved.

---

### Requirement 6: Custom Categories

**User Story:** As a user, I want to create my own spending categories, so that I can organize transactions in a way that fits my life.

#### Acceptance Criteria

1. THE App SHALL initialize the category list with the defaults: Food, Transport, Fun.
2. THE App SHALL provide a text input and an Add button for creating a new category.
3. WHEN the user submits a new category name, THE App SHALL reject it and show an error if the name is empty or already exists (comparison is case-insensitive).
4. WHEN the user submits a valid new category name, THE App SHALL add it to the category list, persist the updated list to localStorage under the key `categories`, and make it available in the transaction form's Category select and in the pie chart with its own distinct color.
5. THE App SHALL NOT provide a delete button for the default categories (Food, Transport, Fun); they are permanent and cannot be removed.
6. WHEN a custom category has at least one associated transaction, THE App SHALL disable or hide that category's delete button to prevent deletion.
7. WHEN a custom category has no associated transactions, THE App SHALL provide a delete button that removes the category from the list and from localStorage.

---

### Requirement 7: Monthly Summary

**User Story:** As a user, I want a monthly breakdown of my spending, so that I can review trends over time.

#### Acceptance Criteria

1. THE App SHALL provide a month selector whose options are built from the distinct year-month values present in State transactions.
2. WHEN the user selects a month, THE App SHALL display: total amount spent, transaction count, a per-category breakdown of amounts, and the top-spending category for that month.
3. WHEN a transaction is added or deleted that affects the available months, THE App SHALL update the month selector options and the displayed summary.
4. WHEN the page loads or the last transaction is deleted, THE App SHALL default the month selector to the most recent month that has transactions.
5. WHEN no month has transactions, THE App SHALL display an empty-state message in the monthly summary section.

---

### Requirement 8: Transaction Sort

**User Story:** As a user, I want to sort my transaction list, so that I can find entries more easily.

#### Acceptance Criteria

1. THE App SHALL provide a sort dropdown with the options: Newest, Oldest, Amount High to Low, Amount Low to High, Category A–Z.
2. WHEN the user changes the sort selection, THE App SHALL re-render the transaction list in the chosen order immediately.
3. THE App SHALL persist the active sort selection to localStorage under the key `sort` and restore it on page load.

---

### Requirement 9: Spending Limit

**User Story:** As a user, I want to set a spending limit, so that I know when I am overspending.

#### Acceptance Criteria

1. THE App SHALL provide a number input for a spending limit (HTML attributes: `type="number"`, `step="1"`, `min="1"`) that is persisted to localStorage under the key `limit`.
2. WHEN a limit is set and the total spending is at or below the limit, THE App SHALL display a progress bar showing total vs. limit.
3. WHEN a limit is set and the total spending exceeds the limit, THE App SHALL keep the progress bar full and render it in red, highlight the total balance in red, and display a warning message.
4. WHEN a limit is set and the total spending exceeds the limit, THE App SHALL visually highlight individual transactions whose amount exceeds the limit.
5. WHEN the limit input is cleared or contains an invalid value, THE App SHALL remove the progress bar, remove the red highlight from the total balance, remove the over-limit warning, and remove all transaction highlights.
6. THE App SHALL expose the over-limit warning via an `aria-live` region.

---

### Requirement 10: Dark/Light Theme Toggle

**User Story:** As a user, I want to switch between dark and light themes, so that I can use the app comfortably in any lighting condition.

#### Acceptance Criteria

1. THE App SHALL provide a styled toggle switch implemented as a checkbox with the id `themeToggle`.
2. WHEN the `change` event fires on `#themeToggle`, THE App SHALL add the class `dark` to `<body>` for dark mode and remove it for light mode.
3. THE App SHALL define all UI colors as CSS custom properties (variables) so that toggling the `dark` class on `<body>` changes the entire color scheme.
4. THE App SHALL animate the toggle knob so it visibly slides between positions.
5. THE App SHALL persist the active theme to localStorage under the key `theme` and restore it on page load.
6. WHEN no theme is saved in localStorage, THE App SHALL apply the theme that matches the user's `prefers-color-scheme` media query.
7. WHEN the theme changes, THE App SHALL update chart text and legend colors to remain readable.

---

### Requirement 11: Architecture and Code Quality

**User Story:** As a developer, I want a clean, maintainable single-file JavaScript architecture, so that the app is easy to understand and extend.

#### Acceptance Criteria

1. THE App SHALL attach all event listeners inside a single `DOMContentLoaded` handler.
2. THE App SHALL expose a single `render()` function that redraws the transaction list, total balance, limit state, monthly summary, and chart from a single State object.
3. THE App SHALL ensure every HTML element id referenced in `js/app.js` exists in `index.html`.
4. THE App SHALL use only plain browser JavaScript with no ES module syntax (`import`, `export`, `require`, `module.exports`).
5. THE App SHALL load Chart.js from `https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js` before `js/app.js` in `index.html`.
6. THE App SHALL use only relative paths (`css/style.css`, `js/app.js`) so it functions on GitHub Pages and when opened as a local file.
7. THE App SHALL include brief comments throughout `js/app.js` to explain non-obvious logic.

---

### Requirement 12: Mobile-First Responsive Layout

**User Story:** As a user, I want the app to work well on my phone, so that I can track spending on the go.

#### Acceptance Criteria

1. THE App SHALL render correctly and be fully usable at a viewport width of 360 px.
2. THE App SHALL apply a clean minimal design with clear visual hierarchy and readable typography.
3. THE App SHALL apply smooth CSS transitions for theme changes and list updates.
4. THE App SHALL provide visible focus styles for all interactive elements to support keyboard navigation.

---

### Requirement 13: Toast Notifications

**User Story:** As a user, I want brief feedback after I add or delete a transaction, so that I know my action succeeded.

#### Acceptance Criteria

1. WHEN a transaction is successfully added, THE App SHALL show a Toast notification.
2. WHEN a transaction is deleted, THE App SHALL show a Toast notification that also includes an Undo option visible for 5 seconds.
3. THE App SHALL automatically dismiss each Toast after a short duration without requiring user interaction.

---

### Requirement 14: Browser Compatibility

**User Story:** As a user, I want the app to work in my browser of choice, so that I am not forced to use a specific browser.

#### Acceptance Criteria

1. THE App SHALL function correctly in the current stable releases of Chrome, Firefox, Edge, and Safari.
2. THE App SHALL produce no console errors on load or on any user action in those browsers.

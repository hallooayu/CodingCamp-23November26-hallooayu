// --- Section 1: Constants ---
const STORAGE_KEYS = { transactions: 'transactions', categories: 'categories', limit: 'limit', sort: 'sort', theme: 'theme' };
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];
const SORT_OPTIONS = ['newest', 'oldest', 'amount-desc', 'amount-asc', 'category-asc'];
const CATEGORY_COLORS = ['#4361ee', '#ef233c', '#2b9348', '#f77f00', '#8338ec',
                          '#00b4d8', '#6c757d', '#ffb703', '#06d6a0', '#b5179e'];

// IDR currency formatter (shared)
const idr = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

// Returns a stable color for a category name
// Default categories get fixed palette slots 0,1,2; custom categories hash over 3+
function getCategoryColor(name) {
  const fixed = { food: 0, transport: 1, fun: 2 };
  const key = name.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(fixed, key)) return CATEGORY_COLORS[fixed[key]];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return CATEGORY_COLORS[3 + (hash % (CATEGORY_COLORS.length - 3))];
}

// --- Section 2: State ---
let state = {
  transactions: [],
  categories: [...DEFAULT_CATEGORIES],
  limit: null,
  sort: 'newest',
  theme: 'light',
};
let chart = null;            // Chart.js instance, created once
let chartAvailable = false; // false when CDN failed
let undoData = null;        // { tx, index, timeoutId } during the 5s undo window
let toastTimeoutId = null;
let selectedMonth = null;   // 'YYYY-MM' currently shown in monthly summary

// --- Section 3: Storage Helpers ---

// Read and parse a JSON value from localStorage; return fallback on any error
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

// Serialize value as JSON and write to localStorage; silently ignore quota/private-mode errors
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) { /* quota exceeded or private mode: app continues from memory */ }
}

// Load all state slices from localStorage with per-field validation and safe defaults
function loadState() {
  // --- transactions ---
  let txs = readJSON(STORAGE_KEYS.transactions, []);
  if (!Array.isArray(txs)) txs = [];
  txs = txs.filter(t =>
    t &&
    Number.isFinite(t.id) &&
    typeof t.name === 'string' && t.name.trim() !== '' &&
    Number.isInteger(t.amount) && t.amount >= 1 &&
    typeof t.category === 'string' &&
    typeof t.date === 'string' && !isNaN(new Date(t.date).getTime())
  );
  state.transactions = txs;

  // --- categories: must be a non-empty array of strings; always contains defaults ---
  let cats = readJSON(STORAGE_KEYS.categories, null);
  if (!Array.isArray(cats) || !cats.every(c => typeof c === 'string')) {
    cats = [...DEFAULT_CATEGORIES];
  }
  // Re-merge any default category that is missing (case-insensitive)
  DEFAULT_CATEGORIES.forEach(d => {
    if (!cats.some(c => c.toLowerCase() === d.toLowerCase())) cats.push(d);
  });
  state.categories = cats;

  // --- limit: positive integer 1-999999999 or null ---
  const rawLimit = readJSON(STORAGE_KEYS.limit, null);
  state.limit = (Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 999999999) ? rawLimit : null;

  // --- sort: must be a known option ---
  const rawSort = readJSON(STORAGE_KEYS.sort, 'newest');
  state.sort = SORT_OPTIONS.includes(rawSort) ? rawSort : 'newest';

  // --- theme: 'light' | 'dark' or null (resolved later by applyTheme via prefers-color-scheme) ---
  const rawTheme = readJSON(STORAGE_KEYS.theme, null);
  state.theme = (rawTheme === 'dark' || rawTheme === 'light') ? rawTheme : null;

  // Re-add any category used by a surviving transaction that isn't already in state.categories
  state.transactions.forEach(t => {
    if (!state.categories.some(c => c.toLowerCase() === t.category.toLowerCase())) {
      state.categories.push(t.category);
    }
  });
}

// Individual save helpers - each wraps one writeJSON call
function saveTransactions() { writeJSON(STORAGE_KEYS.transactions, state.transactions); }
function saveCategories()   { writeJSON(STORAGE_KEYS.categories, state.categories); }
function saveLimit()        { writeJSON(STORAGE_KEYS.limit, state.limit); }
function saveSort()         { writeJSON(STORAGE_KEYS.sort, state.sort); }
function saveTheme()        { writeJSON(STORAGE_KEYS.theme, state.theme); }

// --- Section 4: Derived Data ---

// Return 'YYYY-MM' using the user's local time zone (not UTC)
function getMonthKey(tx) {
  const d = new Date(tx.date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Sum of all transaction amounts
function getTotal() {
  return state.transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

// Return a sorted copy of state.transactions according to state.sort
function getSortedTransactions() {
  const copy = [...state.transactions];
  switch (state.sort) {
    case 'oldest':       return copy.sort((a, b) => a.date.localeCompare(b.date));
    case 'amount-desc':  return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':   return copy.sort((a, b) => a.amount - b.amount);
    case 'category-asc': return copy.sort((a, b) => a.category.localeCompare(b.category, 'en'));
    default:             return copy.sort((a, b) => b.date.localeCompare(a.date)); // newest
  }
}

// Return unique 'YYYY-MM' values present in transactions, sorted most recent first
function getDistinctMonths() {
  const months = [...new Set(state.transactions.map(getMonthKey))];
  return months.sort().reverse();
}

// Return all transactions whose local month key matches the given 'YYYY-MM'
function getMonthTransactions(month) {
  return state.transactions.filter(t => getMonthKey(t) === month);
}

// --- Section 5 (partial): renderCategories ---
// Renders category chips with colored dots, delete buttons for eligible custom
// categories, and repopulates the #itemCategory select preserving selection.
function renderCategories() {
  const list = document.getElementById('categoryList');
  const select = document.getElementById('itemCategory');

  // Remember the current select selection so it can be restored after rebuild
  const prevSelection = select.value;

  // --- Chips ---
  list.textContent = '';
  state.categories.forEach(name => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';

    // Colored dot using the category's palette color
    const dot = document.createElement('span');
    dot.className = 'category-dot';
    dot.style.backgroundColor = getCategoryColor(name);
    chip.appendChild(dot);

    // Category name (textContent only, never innerHTML)
    const label = document.createElement('span');
    label.className = 'category-name';
    label.textContent = name;
    chip.appendChild(label);

    // Delete button: never for defaults; only for custom categories with
    // zero associated transactions (case-insensitive match).
    const isDefault = DEFAULT_CATEGORIES.some(d => d.toLowerCase() === name.toLowerCase());
    const hasTransactions = state.transactions.some(
      t => t.category.toLowerCase() === name.toLowerCase()
    );
    if (!isDefault && !hasTransactions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'category-delete';
      btn.dataset.category = name;
      btn.setAttribute('aria-label', 'Delete category ' + name);
      btn.textContent = '✕';
      chip.appendChild(btn);
    }

    list.appendChild(chip);
  });

  // --- Repopulate #itemCategory options ---
  select.textContent = '';
  state.categories.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  // Preserve the previous selection if it still exists in the new list
  const stillExists = state.categories.some(c => c === prevSelection);
  select.value = stillExists ? prevSelection : state.categories[0];
}

// --- Section 5: Rendering ---

// Render total balance: format with IDR, toggle .over-limit class when limit exceeded
function renderTotal() {
  const total = getTotal();
  const el = document.getElementById('totalBalance');
  el.textContent = idr.format(total);
  el.classList.toggle('over-limit', state.limit !== null && total > state.limit);
}

// Render the sorted transaction list; uses textContent only for all user-supplied values
function renderList() {
  const sorted = getSortedTransactions();
  const list = document.getElementById('transactionList');
  // Clear existing rows
  list.textContent = '';

  if (sorted.length === 0) {
    // Empty state
    const empty = document.createElement('li');
    empty.textContent = 'No transactions yet.';
    empty.className = 'empty-state';
    list.appendChild(empty);
    return;
  }

  sorted.forEach(tx => {
    const li = document.createElement('li');

    // Highlight rows whose amount exceeds the spending limit
    if (state.limit !== null && tx.amount > state.limit) {
      li.classList.add('over-limit');
    }

    // Name span
    const nameSpan = document.createElement('span');
    nameSpan.className = 'tx-name';
    nameSpan.textContent = tx.name;

    // Amount span (IDR formatted)
    const amountSpan = document.createElement('span');
    amountSpan.className = 'tx-amount';
    amountSpan.textContent = idr.format(tx.amount);

    // Category span
    const catSpan = document.createElement('span');
    catSpan.className = 'tx-category';
    catSpan.textContent = tx.category;

    // Date span (readable local date)
    const dateSpan = document.createElement('span');
    dateSpan.className = 'tx-date';
    dateSpan.textContent = new Date(tx.date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });

    // Delete button — aria-label set via setAttribute so screen readers name which item
    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.dataset.id = tx.id;
    delBtn.setAttribute('aria-label', 'Delete ' + tx.name);
    delBtn.textContent = 'Delete';

    li.appendChild(nameSpan);
    li.appendChild(amountSpan);
    li.appendChild(catSpan);
    li.appendChild(dateSpan);
    li.appendChild(delBtn);

    list.appendChild(li);
  });
}

// Render the pie chart of spending by category.
// Guards on chartAvailable (CDN fallback already shown), aggregates
// per-category totals, mutates chart.data in place, and calls chart.update().
function renderChart() {
  // Guard: Chart.js failed to load — the fallback message is already visible
  if (!chartAvailable || !chart) return;

  const noData = document.getElementById('chartNoData');

  if (state.transactions.length === 0) {
    // Empty state: overlay shown, canvas stays in the DOM at fixed height
    if (noData) noData.hidden = false;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[0].backgroundColor = [];
    chart.update();
    return;
  }

  // Hide the empty-state overlay
  if (noData) noData.hidden = true;

  // Aggregate per-category totals (only categories with a nonzero total)
  const totals = {};
  state.transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });
  // Keep only categories that have a nonzero total
  const labels = Object.keys(totals).filter(name => totals[name] > 0);

  chart.data.labels = labels;
  chart.data.datasets[0].data = labels.map(name => totals[name]);
  chart.data.datasets[0].backgroundColor = labels.map(name => getCategoryColor(name));

  // Theme-aware text/legend/tooltip colors (read from live CSS variables)
  const textColor = getChartTextColor();
  chart.options.plugins.legend.labels.color = textColor;
  if (chart.options.plugins.tooltip) {
    chart.options.plugins.tooltip.titleColor = textColor;
    chart.options.plugins.tooltip.bodyColor = textColor;
  }

  chart.update();
}

// --- Section 6: Chart Initialization ---

// Create the Chart.js pie chart instance once at startup.
// If the CDN script failed to load, show the fallback message and bail out.
function initChart() {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) return;

  if (typeof Chart === 'undefined') {
    // CDN failed: show friendly fallback, hide the "no data" overlay
    chartAvailable = false;
    const fallback = document.getElementById('chartFallback');
    const noData = document.getElementById('chartNoData');
    if (fallback) fallback.removeAttribute('hidden');
    if (noData) noData.setAttribute('hidden', '');
    return;
  }

  // CDN available: create the single pie chart instance
  chartAvailable = true;
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: []
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getChartTextColor() // getChartTextColor defined in Section 7
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ' ' + ctx.label + ': ' + idr.format(ctx.parsed)
          }
        }
      }
    }
  });
}

// --- Section 6 (partial): renderLimit ---

// Render the spending limit section: progress bar fill, over-limit highlights,
// and the always-present #limitWarning text (never hidden, only text changes).
function renderLimit() {
  const total = getTotal();
  const limit = state.limit;

  const progressEl   = document.getElementById('limitProgress');
  const fillEl       = document.getElementById('limitProgressFill');
  const warningEl    = document.getElementById('limitWarning');
  const totalEl      = document.getElementById('totalBalance');

  if (limit === null) {
    // No valid limit: hide the progress bar and clear all limit-related highlights
    progressEl.setAttribute('hidden', '');
    warningEl.textContent = '';
    totalEl.classList.remove('over-limit');

    // Remove .over-limit from every transaction row
    document.querySelectorAll('#transactionList .over-limit').forEach(el => {
      el.classList.remove('over-limit');
    });
    return;
  }

  // Valid limit: show the progress bar
  progressEl.removeAttribute('hidden');

  const fillPercent = Math.min(100, (total / limit) * 100);
  fillEl.style.width = fillPercent + '%';

  if (total > limit) {
    // Over limit: red fill, red total, warning message
    fillEl.classList.add('over');
    totalEl.classList.add('over-limit');
    warningEl.textContent = 'You have exceeded your spending limit.';
  } else {
    // Within limit: normal fill, clear warning
    fillEl.classList.remove('over');
    totalEl.classList.remove('over-limit');
    warningEl.textContent = '';
  }
}

// --- Section 6 (partial): renderMonthlySummary ---

// Rebuild #monthSelect options from distinct transaction months (most recent first).
// Restores or defaults the selected month, then renders summary figures
// (total, count, per-category breakdown, top category) for the selected month.
function renderMonthlySummary() {
  const months = getDistinctMonths(); // ['YYYY-MM', ...] most recent first
  const monthSelect = document.getElementById('monthSelect');
  const summaryBody = document.getElementById('summaryBody');

  // --- Rebuild #monthSelect options ---
  monthSelect.textContent = '';
  months.forEach(month => {
    const opt = document.createElement('option');
    opt.value = month;
    // Human-readable label using local date construction (avoids UTC offset issues)
    const [year, mon] = month.split('-').map(Number);
    opt.textContent = new Date(year, mon - 1, 1).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long'
    });
    monthSelect.appendChild(opt);
  });

  // --- Restore or default selectedMonth ---
  const monthExists = months.includes(selectedMonth);
  if (!monthExists) {
    // Default to most recent month (or null if there are none)
    selectedMonth = months.length > 0 ? months[0] : null;
  }
  monthSelect.value = selectedMonth || '';

  // --- Empty state ---
  if (months.length === 0) {
    summaryBody.textContent = 'No transactions yet.';
    return;
  }

  // --- With data: compute summary for selectedMonth ---
  const txs = getMonthTransactions(selectedMonth);
  const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
  const count = txs.length;

  // Per-category totals
  const catTotals = {};
  txs.forEach(tx => {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  });

  // Sort categories descending by amount (ties broken A–Z)
  const sortedCats = Object.keys(catTotals).sort((a, b) => {
    const diff = catTotals[b] - catTotals[a];
    if (diff !== 0) return diff;
    return a.localeCompare(b, 'en');
  });

  // Top category: highest total; ties broken by A–Z category name
  const topCategory = sortedCats.length > 0 ? sortedCats[0] : null;

  // --- Build summary DOM (textContent only for user-supplied values) ---
  summaryBody.textContent = '';

  // Total row
  const totalP = document.createElement('p');
  const totalLabel = document.createElement('strong');
  totalLabel.textContent = 'Total: ';
  totalP.appendChild(totalLabel);
  totalP.appendChild(document.createTextNode(idr.format(total)));
  summaryBody.appendChild(totalP);

  // Count row
  const countP = document.createElement('p');
  const countLabel = document.createElement('strong');
  countLabel.textContent = 'Transactions: ';
  countP.appendChild(countLabel);
  countP.appendChild(document.createTextNode(count));
  summaryBody.appendChild(countP);

  // Top category row
  if (topCategory !== null) {
    const topP = document.createElement('p');
    const topLabel = document.createElement('strong');
    topLabel.textContent = 'Top category: ';
    topP.appendChild(topLabel);
    topP.appendChild(document.createTextNode(topCategory + ' (' + idr.format(catTotals[topCategory]) + ')'));
    summaryBody.appendChild(topP);
  }

  // Per-category breakdown header
  const breakdownHeader = document.createElement('p');
  const breakdownLabel = document.createElement('strong');
  breakdownLabel.textContent = 'Breakdown:';
  breakdownHeader.appendChild(breakdownLabel);
  summaryBody.appendChild(breakdownHeader);

  // Per-category breakdown list (sorted descending)
  const catList = document.createElement('ul');
  catList.className = 'summary-breakdown';
  sortedCats.forEach(cat => {
    const li = document.createElement('li');
    const catName = document.createElement('span');
    catName.className = 'summary-cat-name';
    catName.textContent = cat;
    const catAmount = document.createElement('span');
    catAmount.className = 'summary-cat-amount';
    catAmount.textContent = idr.format(catTotals[cat]);
    li.appendChild(catName);
    li.appendChild(document.createTextNode(': '));
    li.appendChild(catAmount);
    catList.appendChild(li);
  });
  summaryBody.appendChild(catList);
}

// --- Section 7: Render orchestration ---
// Single entry point for redrawing the entire UI from state.
// Always runs all six sub-renders in this fixed order so the layout settles consistently.
function render() {
  renderTotal();
  renderList();
  renderChart();
  renderLimit();
  renderMonthlySummary();
  renderCategories();
}

// --- Section 7: Theme ---

// Read a live CSS custom-property value from document.body
function getCSSColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

// Return the current theme's text color (used for chart labels and legend)
function getChartTextColor() {
  return getCSSColor('--text');
}

// Apply the given theme (or resolve from prefers-color-scheme when null).
// Sets state.theme, toggles 'dark' on <body>, syncs the toggle checkbox,
// and refreshes chart label colors without a full render().
function applyTheme(theme) {
  // Resolve null to the OS/browser preference
  if (theme === null || theme === undefined) {
    theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  state.theme = theme;
  document.body.classList.toggle('dark', state.theme === 'dark');
  document.getElementById('themeToggle').checked = state.theme === 'dark';
  updateChartColors();
}

// Update chart legend and text colors to match the current CSS theme variables.
// No-ops if Chart.js is unavailable or the chart has not been created yet.
function updateChartColors() {
  if (!chartAvailable || !chart) return;
  chart.options.plugins.legend.labels.color = getChartTextColor();
  chart.update();
}

// --- Section 7 (partial): restoreControls ---

// Restore persistent UI control values after loadState() so the DOM reflects
// the state before the first render() call.
function restoreControls() {
  document.getElementById('sortSelect').value = state.sort;
  document.getElementById('limitInput').value = state.limit !== null ? state.limit : '';
}

// --- Section 8: Toast & Undo ---

// Show the toast with a message; optionally include the Undo button.
// Auto-dismisses after 5s (with Undo) or 3s (plain).
function showToast(message, withUndo) {
  const toast     = document.getElementById('toast');
  const msgEl     = document.getElementById('toastMessage');
  const undoBtn   = document.getElementById('toastUndo');

  msgEl.textContent = message;
  undoBtn.hidden    = !withUndo;
  toast.classList.add('visible');

  // Reset any in-flight dismiss timer
  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(function () {
    dismissToast();
  }, withUndo ? 5000 : 3000);
}

// Remove the visible class and clear the dismiss timer.
function dismissToast() {
  clearTimeout(toastTimeoutId);
  toastTimeoutId = null;
  document.getElementById('toast').classList.remove('visible');
}

// Cancel the pending undo (clear its timeout, null out undoData)
// and hide the Undo button regardless of toast visibility.
function clearUndo() {
  if (undoData) {
    clearTimeout(undoData.timeoutId);
    undoData = null;
  }
  document.getElementById('toastUndo').hidden = true;
}

// --- Section 9: Event Handlers (DOMContentLoaded) ---

document.addEventListener('DOMContentLoaded', function () {

  // ── Startup sequence ────────────────────────────────────────────────────────
  loadState();
  applyTheme(state.theme);   // resolves prefers-color-scheme when state.theme is null
  initChart();
  restoreControls();
  render();

  // ── Transaction form submit ──────────────────────────────────────────────────
  document.getElementById('transactionForm').addEventListener('submit', function (e) {
    e.preventDefault();

    var name       = document.getElementById('itemName').value.trim();
    var amountRaw  = document.getElementById('itemAmount').value;
    var category   = document.getElementById('itemCategory').value;
    var errEl      = document.getElementById('formErrors');

    errEl.textContent = '';
    var errors = [];

    if (!name) {
      errors.push('Item Name is required.');
    }

    var amount = Number(amountRaw);
    if (!amountRaw || !Number.isInteger(amount) || amount < 1 || amount > 999999999) {
      errors.push('Amount must be a whole number between 1 and 999,999,999.');
    }

    if (errors.length) {
      errEl.textContent = errors.join(' ');
      return;
    }

    var tx = {
      id:       Date.now(),
      name:     name,
      amount:   amount,
      category: category,
      date:     new Date().toISOString()
    };
    state.transactions.push(tx);
    saveTransactions();

    // Reset the form; then re-populate the category select (reset clears it)
    document.getElementById('transactionForm').reset();
    renderCategories();

    clearUndo();
    render();
    showToast('Transaction added!');
  });

  // ── Delete transaction (event delegation on #transactionList) ───────────────
  document.getElementById('transactionList').addEventListener('click', function (e) {
    var btn = e.target.closest('button.delete-btn');
    if (!btn) return;

    var id    = Number(btn.dataset.id);
    var index = state.transactions.findIndex(function (t) { return t.id === id; });
    if (index === -1) return;

    var removed = state.transactions.splice(index, 1)[0];
    saveTransactions();

    // Cancel any existing undo window before creating a new one
    clearUndo();

    var timeoutId = setTimeout(clearUndo, 5000);
    undoData = { tx: removed, index: index, timeoutId: timeoutId };

    render();
    showToast('Transaction deleted.', true);
  });

  // ── Undo delete ─────────────────────────────────────────────────────────────
  document.getElementById('toastUndo').addEventListener('click', function () {
    if (!undoData) return;

    // Splice the transaction back at its original position (clamped to list length)
    var insertAt = Math.min(undoData.index, state.transactions.length);
    state.transactions.splice(insertAt, 0, undoData.tx);
    saveTransactions();

    clearUndo();
    dismissToast();
    render();
    showToast('Delete undone.');
  });

  // ── Sort change ─────────────────────────────────────────────────────────────
  document.getElementById('sortSelect').addEventListener('change', function (e) {
    state.sort = e.target.value;
    saveSort();
    renderList();
  });

  // ── Spending limit input ─────────────────────────────────────────────────────
  document.getElementById('limitInput').addEventListener('input', function (e) {
    var v = Number(e.target.value);
    state.limit = (Number.isInteger(v) && v >= 1 && v <= 999999999) ? v : null;
    saveLimit();
    render();
  });

  // ── Month select change ──────────────────────────────────────────────────────
  document.getElementById('monthSelect').addEventListener('change', function (e) {
    selectedMonth = e.target.value || null;
    renderMonthlySummary();
  });

  // ── Add category: button click ───────────────────────────────────────────────
  function handleAddCategory() {
    var input  = document.getElementById('categoryInput');
    var errEl  = document.getElementById('categoryErrors');
    var name   = input.value.trim();

    errEl.textContent = '';

    if (!name) {
      errEl.textContent = 'Category name is required.';
      return;
    }

    if (state.categories.some(function (c) { return c.toLowerCase() === name.toLowerCase(); })) {
      errEl.textContent = 'That category already exists.';
      return;
    }

    state.categories.push(name);
    saveCategories();
    input.value = '';
    renderCategories();
    renderChart();
  }

  document.getElementById('addCategoryBtn').addEventListener('click', handleAddCategory);

  // ── Add category: Enter key in #categoryInput ────────────────────────────────
  document.getElementById('categoryInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddCategory();
    }
  });

  // ── Delete category (event delegation on #categoryList) ─────────────────────
  document.getElementById('categoryList').addEventListener('click', function (e) {
    var btn = e.target.closest('button.category-delete');
    if (!btn) return;

    var name = btn.dataset.category;

    // Guard: never delete default categories
    if (DEFAULT_CATEGORIES.some(function (d) { return d.toLowerCase() === name.toLowerCase(); })) return;

    // Guard: never delete categories that are still in use by transactions
    if (state.transactions.some(function (t) { return t.category.toLowerCase() === name.toLowerCase(); })) return;

    state.categories = state.categories.filter(function (c) { return c !== name; });
    saveCategories();
    renderCategories();
    renderChart();
  });

  // ── Theme toggle change ──────────────────────────────────────────────────────
  document.getElementById('themeToggle').addEventListener('change', function (e) {
    state.theme = e.target.checked ? 'dark' : 'light';
    document.body.classList.toggle('dark', state.theme === 'dark');
    saveTheme();
    updateChartColors(); // CSS handles everything else; no full render needed
  });

});

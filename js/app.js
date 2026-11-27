// --- Section 1: Constants ---
const STORAGE_KEYS = {
  transactions: 'transactions',
  categories: 'categories',
  limit: 'limit',
  sort: 'sort',
  theme: 'theme',
};
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun'];
const SORT_OPTIONS = ['newest', 'oldest', 'amount-desc', 'amount-asc', 'category-asc'];
const CATEGORY_COLORS = [
  '#4361ee', '#ef233c', '#2b9348', '#f77f00', '#8338ec',
  '#00b4d8', '#6c757d', '#ffb703', '#06d6a0', '#b5179e',
];

const idr = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

function getCategoryColor(name) {
  const fixed = { food: 0, transport: 1, fun: 2 };
  const key = String(name || '').toLowerCase();
  if (Object.prototype.hasOwnProperty.call(fixed, key)) {
    return CATEGORY_COLORS[fixed[key]];
  }
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CATEGORY_COLORS[3 + (hash % (CATEGORY_COLORS.length - 3))];
}

// --- Section 2: State ---
let state = {
  transactions: [],
  categories: [...DEFAULT_CATEGORIES],
  limit: null,
  sort: 'newest',
  theme: null, // null = follow prefers-color-scheme
};

let chart = null;
let chartAvailable = false;
let undoData = null;
let toastTimeoutId = null;
let selectedMonth = null;

// --- Section 3: Storage Helpers ---
function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Ignore storage quota or private-mode errors
  }
}

function loadState() {
  let txs = readJSON(STORAGE_KEYS.transactions, []);
  if (!Array.isArray(txs)) txs = [];
  state.transactions = txs.filter(t =>
    t &&
    Number.isFinite(t.id) &&
    typeof t.name === 'string' && t.name.trim() !== '' &&
    Number.isInteger(t.amount) && t.amount >= 1 && t.amount <= 999999999 &&
    typeof t.category === 'string' && t.category.trim() !== '' &&
    typeof t.date === 'string' && !Number.isNaN(new Date(t.date).getTime())
  );

  let cats = readJSON(STORAGE_KEYS.categories, null);
  if (!Array.isArray(cats) || !cats.every(c => typeof c === 'string' && c.trim() !== '')) {
    cats = [...DEFAULT_CATEGORIES];
  } else {
    cats = cats.map(c => c.trim());
  }

  DEFAULT_CATEGORIES.forEach(def => {
    if (!cats.some(c => c.toLowerCase() === def.toLowerCase())) {
      cats.push(def);
    }
  });

  state.transactions.forEach(tx => {
    if (!cats.some(c => c.toLowerCase() === tx.category.toLowerCase())) {
      cats.push(tx.category);
    }
  });

  state.categories = cats;

  const rawLimit = readJSON(STORAGE_KEYS.limit, null);
  state.limit = (Number.isInteger(rawLimit) && rawLimit >= 1 && rawLimit <= 999999999)
    ? rawLimit
    : null;

  const rawSort = readJSON(STORAGE_KEYS.sort, 'newest');
  state.sort = SORT_OPTIONS.includes(rawSort) ? rawSort : 'newest';

  const rawTheme = readJSON(STORAGE_KEYS.theme, null);
  state.theme = (rawTheme === 'dark' || rawTheme === 'light') ? rawTheme : null;
}

function saveTransactions() { writeJSON(STORAGE_KEYS.transactions, state.transactions); }
function saveCategories()   { writeJSON(STORAGE_KEYS.categories, state.categories); }
function saveLimit()        { writeJSON(STORAGE_KEYS.limit, state.limit); }
function saveSort()         { writeJSON(STORAGE_KEYS.sort, state.sort); }
function saveTheme()        { writeJSON(STORAGE_KEYS.theme, state.theme); }

// --- Section 4: Derived Data ---
function getMonthKey(tx) {
  const d = new Date(tx.date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getTotal() {
  return state.transactions.reduce((sum, tx) => sum + tx.amount, 0);
}

function getSortedTransactions() {
  const copy = [...state.transactions];
  switch (state.sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    case 'amount-desc':
      return copy.sort((a, b) => b.amount - a.amount);
    case 'amount-asc':
      return copy.sort((a, b) => a.amount - b.amount);
    case 'category-asc':
      return copy.sort((a, b) => a.category.localeCompare(b.category, 'en'));
    default:
      return copy.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }
}

function getDistinctMonths() {
  return [...new Set(state.transactions.map(getMonthKey))].sort((a, b) => b.localeCompare(a));
}

function getMonthTransactions(month) {
  return state.transactions.filter(t => getMonthKey(t) === month);
}

// --- Section 5: Rendering ---
function renderCategories() {
  const list = document.getElementById('categoryList');
  const select = document.getElementById('itemCategory');
  if (!list || !select) return;

  const prevSelection = select.value;

  list.textContent = '';
  state.categories.forEach(name => {
    const chip = document.createElement('div');
    chip.className = 'category-chip';

    const dot = document.createElement('span');
    dot.className = 'category-dot';
    dot.style.backgroundColor = getCategoryColor(name);
    chip.appendChild(dot);

    const label = document.createElement('span');
    label.className = 'category-name';
    label.textContent = name;
    chip.appendChild(label);

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

  select.textContent = '';
  state.categories.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    select.appendChild(opt);
  });

  const stillExists = state.categories.some(c => c === prevSelection);
  select.value = stillExists ? prevSelection : (state.categories[0] || '');
}

function renderTotal() {
  const el = document.getElementById('totalBalance');
  if (!el) return;
  const total = getTotal();
  el.textContent = idr.format(total);
  el.classList.toggle('over-limit', state.limit !== null && total > state.limit);
}

function renderList() {
  const list = document.getElementById('transactionList');
  if (!list) return;

  const sorted = getSortedTransactions();
  list.textContent = '';

  if (sorted.length === 0) {
    const empty = document.createElement('li');
    empty.textContent = 'No transactions yet.';
    empty.className = 'empty-state';
    list.appendChild(empty);
    return;
  }

  sorted.forEach(tx => {
    const li = document.createElement('li');
    if (state.limit !== null && tx.amount > state.limit) {
      li.classList.add('over-limit');
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tx-name';
    nameSpan.textContent = tx.name;

    const amountSpan = document.createElement('span');
    amountSpan.className = 'tx-amount';
    amountSpan.textContent = idr.format(tx.amount);

    const catSpan = document.createElement('span');
    catSpan.className = 'tx-category';
    catSpan.textContent = tx.category;

    const dateSpan = document.createElement('span');
    dateSpan.className = 'tx-date';
    dateSpan.textContent = new Date(tx.date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'delete-btn';
    delBtn.dataset.id = String(tx.id);
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

function renderChart() {
  if (!chartAvailable || !chart) return;

  const noData = document.getElementById('chartNoData');

  if (state.transactions.length === 0) {
    if (noData) noData.hidden = false;
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.data.datasets[0].backgroundColor = [];
    chart.update();
    return;
  }

  if (noData) noData.hidden = true;

  const totals = {};
  state.transactions.forEach(tx => {
    totals[tx.category] = (totals[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(totals).filter(name => totals[name] > 0);
  chart.data.labels = labels;
  chart.data.datasets[0].data = labels.map(name => totals[name]);
  chart.data.datasets[0].backgroundColor = labels.map(name => getCategoryColor(name));

  const textColor = getChartTextColor();
  chart.options.plugins.legend.labels.color = textColor;
  if (chart.options.plugins.tooltip) {
    chart.options.plugins.tooltip.titleColor = textColor;
    chart.options.plugins.tooltip.bodyColor = textColor;
  }

  chart.update();
}

// --- Section 6: Chart, Limit & Monthly Summary ---
function initChart() {
  const ctx = document.getElementById('expenseChart');
  if (!ctx) return;

  if (typeof Chart === 'undefined') {
    chartAvailable = false;
    const fallback = document.getElementById('chartFallback');
    const noData = document.getElementById('chartNoData');
    if (fallback) fallback.removeAttribute('hidden');
    if (noData) noData.setAttribute('hidden', '');
    return;
  }

  chartAvailable = true;
  chart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: [],
      datasets: [{
        data: [],
        backgroundColor: [],
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: getChartTextColor(),
          },
        },
        tooltip: {
          titleColor: getChartTextColor(),
          bodyColor: getChartTextColor(),
          callbacks: {
            label: (context) => ' ' + context.label + ': ' + idr.format(context.parsed),
          },
        },
      },
    },
  });
}

function renderLimit() {
  const total = getTotal();
  const limit = state.limit;

  const progressEl = document.getElementById('limitProgress');
  const fillEl = document.getElementById('limitProgressFill');
  const warningEl = document.getElementById('limitWarning');
  const totalEl = document.getElementById('totalBalance');

  if (!progressEl || !fillEl || !warningEl || !totalEl) return;

  if (limit === null) {
    progressEl.setAttribute('hidden', '');
    warningEl.textContent = '';
    totalEl.classList.remove('over-limit');
    document.querySelectorAll('#transactionList .over-limit').forEach(el => {
      el.classList.remove('over-limit');
    });
    return;
  }

  progressEl.removeAttribute('hidden');

  const fillPercent = Math.min(100, (total / limit) * 100);
  fillEl.style.width = fillPercent + '%';

  if (total > limit) {
    fillEl.classList.add('over');
    totalEl.classList.add('over-limit');
    warningEl.textContent = 'You have exceeded your spending limit.';
  } else {
    fillEl.classList.remove('over');
    totalEl.classList.remove('over-limit');
    warningEl.textContent = '';
  }
}

function renderMonthlySummary() {
  const months = getDistinctMonths();
  const monthSelect = document.getElementById('monthSelect');
  const summaryBody = document.getElementById('summaryBody');
  if (!monthSelect || !summaryBody) return;

  monthSelect.textContent = '';
  months.forEach(month => {
    const opt = document.createElement('option');
    opt.value = month;
    const [year, mon] = month.split('-').map(Number);
    opt.textContent = new Date(year, mon - 1, 1).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
    monthSelect.appendChild(opt);
  });

  if (!months.includes(selectedMonth)) {
    selectedMonth = months.length > 0 ? months[0] : null;
  }
  monthSelect.value = selectedMonth || '';

  if (months.length === 0) {
    summaryBody.textContent = 'No transactions yet.';
    return;
  }

  const txs = getMonthTransactions(selectedMonth);
  const total = txs.reduce((sum, tx) => sum + tx.amount, 0);
  const count = txs.length;

  const catTotals = {};
  txs.forEach(tx => {
    catTotals[tx.category] = (catTotals[tx.category] || 0) + tx.amount;
  });

  const sortedCats = Object.keys(catTotals).sort((a, b) => {
    const diff = catTotals[b] - catTotals[a];
    if (diff !== 0) return diff;
    return a.localeCompare(b, 'en');
  });

  const topCategory = sortedCats.length > 0 ? sortedCats[0] : null;

  summaryBody.textContent = '';

  const totalP = document.createElement('p');
  const totalLabel = document.createElement('strong');
  totalLabel.textContent = 'Total: ';
  totalP.appendChild(totalLabel);
  totalP.appendChild(document.createTextNode(idr.format(total)));
  summaryBody.appendChild(totalP);

  const countP = document.createElement('p');
  const countLabel = document.createElement('strong');
  countLabel.textContent = 'Transactions: ';
  countP.appendChild(countLabel);
  countP.appendChild(document.createTextNode(String(count)));
  summaryBody.appendChild(countP);

  if (topCategory !== null) {
    const topP = document.createElement('p');
    const topLabel = document.createElement('strong');
    topLabel.textContent = 'Top category: ';
    topP.appendChild(topLabel);
    topP.appendChild(
      document.createTextNode(topCategory + ' (' + idr.format(catTotals[topCategory]) + ')')
    );
    summaryBody.appendChild(topP);
  }

  const breakdownHeader = document.createElement('p');
  const breakdownLabel = document.createElement('strong');
  breakdownLabel.textContent = 'Breakdown:';
  breakdownHeader.appendChild(breakdownLabel);
  summaryBody.appendChild(breakdownHeader);

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

// --- Section 7: Render Orchestration, Theme & Controls ---
function render() {
  renderTotal();
  renderList();
  renderChart();
  renderLimit();
  renderMonthlySummary();
  renderCategories();
}

function getCSSColor(varName) {
  return getComputedStyle(document.body).getPropertyValue(varName).trim();
}

function getChartTextColor() {
  return getCSSColor('--text') || '#212529';
}

function applyTheme(theme) {
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  state.theme = theme;
  document.body.classList.toggle('dark', state.theme === 'dark');

  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = state.theme === 'dark';

  updateChartColors();
}

function updateChartColors() {
  if (!chartAvailable || !chart) return;
  const textColor = getChartTextColor();
  chart.options.plugins.legend.labels.color = textColor;
  if (chart.options.plugins.tooltip) {
    chart.options.plugins.tooltip.titleColor = textColor;
    chart.options.plugins.tooltip.bodyColor = textColor;
  }
  chart.update();
}

function restoreControls() {
  const sortSelect = document.getElementById('sortSelect');
  const limitInput = document.getElementById('limitInput');
  if (sortSelect) sortSelect.value = state.sort;
  if (limitInput) limitInput.value = state.limit !== null ? String(state.limit) : '';
}

// --- Section 8: Toast & Undo ---
function showToast(message, withUndo = false) {
  const toast = document.getElementById('toast');
  const msgEl = document.getElementById('toastMessage');
  const undoBtn = document.getElementById('toastUndo');
  if (!toast || !msgEl) return;

  msgEl.textContent = message;
  if (undoBtn) undoBtn.hidden = !withUndo;
  toast.classList.add('visible');

  clearTimeout(toastTimeoutId);
  toastTimeoutId = setTimeout(dismissToast, withUndo ? 5000 : 3000);
}

function dismissToast() {
  clearTimeout(toastTimeoutId);
  toastTimeoutId = null;
  const toast = document.getElementById('toast');
  if (toast) toast.classList.remove('visible');
}

function clearUndo() {
  if (undoData) {
    clearTimeout(undoData.timeoutId);
    undoData = null;
  }
  const undoBtn = document.getElementById('toastUndo');
  if (undoBtn) undoBtn.hidden = true;
}

// --- Section 9: Event Handlers ---
document.addEventListener('DOMContentLoaded', function () {
  loadState();
  applyTheme(state.theme);
  initChart();
  restoreControls();
  render();

  const txForm = document.getElementById('transactionForm');
  if (txForm) {
    txForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const nameInput = document.getElementById('itemName');
      const amountInput = document.getElementById('itemAmount');
      const categorySelect = document.getElementById('itemCategory');
      const errEl = document.getElementById('formErrors');

      const name = nameInput ? nameInput.value.trim() : '';
      const amountRaw = amountInput ? amountInput.value.trim() : '';
      const category = categorySelect ? categorySelect.value : DEFAULT_CATEGORIES[0];

      if (errEl) errEl.textContent = '';
      const errors = [];

      if (!name) {
        errors.push('Item Name is required.');
      }

      const amount = Number(amountRaw);
      if (!amountRaw || !Number.isInteger(amount) || amount < 1 || amount > 999999999) {
        errors.push('Amount must be a whole number between 1 and 999,999,999.');
      }

      if (errors.length > 0) {
        if (errEl) errEl.textContent = errors.join(' ');
        return;
      }

      const tx = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        name,
        amount,
        category,
        date: new Date().toISOString(),
      };

      state.transactions.push(tx);
      saveTransactions();

      txForm.reset();
      renderCategories();
      clearUndo();
      render();
      showToast('Transaction added!');
    });
  }

  const txList = document.getElementById('transactionList');
  if (txList) {
    txList.addEventListener('click', function (e) {
      const btn = e.target.closest('button.delete-btn');
      if (!btn) return;

      const id = Number(btn.dataset.id);
      const index = state.transactions.findIndex(t => t.id === id);
      if (index === -1) return;

      const removed = state.transactions.splice(index, 1)[0];
      saveTransactions();

      clearUndo();
      const timeoutId = setTimeout(clearUndo, 5000);
      undoData = { tx: removed, index, timeoutId };

      render();
      showToast('Transaction deleted.', true);
    });
  }

  const undoBtn = document.getElementById('toastUndo');
  if (undoBtn) {
    undoBtn.addEventListener('click', function () {
      if (!undoData) return;

      const insertAt = Math.min(undoData.index, state.transactions.length);
      state.transactions.splice(insertAt, 0, undoData.tx);
      saveTransactions();

      clearUndo();
      dismissToast();
      render();
      showToast('Delete undone.');
    });
  }

  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    sortSelect.addEventListener('change', function (e) {
      state.sort = e.target.value;
      saveSort();
      renderList();
    });
  }

  const limitInput = document.getElementById('limitInput');
  if (limitInput) {
    limitInput.addEventListener('input', function (e) {
      const raw = e.target.value.trim();
      const v = Number(raw);
      state.limit = (raw !== '' && Number.isInteger(v) && v >= 1 && v <= 999999999)
        ? v
        : null;
      saveLimit();
      render();
    });
  }

  const monthSelect = document.getElementById('monthSelect');
  if (monthSelect) {
    monthSelect.addEventListener('change', function (e) {
      selectedMonth = e.target.value || null;
      renderMonthlySummary();
    });
  }

  function handleAddCategory() {
    const input = document.getElementById('categoryInput');
    const errEl = document.getElementById('categoryErrors');
    if (!input) return;

    const name = input.value.trim();
    if (errEl) errEl.textContent = '';

    if (!name) {
      if (errEl) errEl.textContent = 'Category name is required.';
      return;
    }

    if (state.categories.some(c => c.toLowerCase() === name.toLowerCase())) {
      if (errEl) errEl.textContent = 'That category already exists.';
      return;
    }

    state.categories.push(name);
    saveCategories();
    input.value = '';
    renderCategories();
    renderChart();
  }

  const addCatBtn = document.getElementById('addCategoryBtn');
  if (addCatBtn) {
    addCatBtn.addEventListener('click', handleAddCategory);
  }

  const catInput = document.getElementById('categoryInput');
  if (catInput) {
    catInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAddCategory();
      }
    });
  }

  const catList = document.getElementById('categoryList');
  if (catList) {
    catList.addEventListener('click', function (e) {
      const btn = e.target.closest('button.category-delete');
      if (!btn) return;

      const name = btn.dataset.category;
      if (!name) return;

      if (DEFAULT_CATEGORIES.some(d => d.toLowerCase() === name.toLowerCase())) return;
      if (state.transactions.some(t => t.category.toLowerCase() === name.toLowerCase())) return;

      state.categories = state.categories.filter(c => c !== name);
      saveCategories();
      renderCategories();
      renderChart();
    });
  }

  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('change', function (e) {
      applyTheme(e.target.checked ? 'dark' : 'light');
      saveTheme();
    });
  }
});

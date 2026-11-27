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
  return [...new Set

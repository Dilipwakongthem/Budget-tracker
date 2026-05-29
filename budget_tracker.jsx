import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import * as XLSX from "xlsx";

const EXPENSE_CATEGORIES = [
  { key: "rent", label: "Rent / Housing", icon: "🏠", color: "#6366f1" },
  { key: "family", label: "Family", icon: "👨‍👩‍👧", color: "#ec4899" },
  { key: "loanEmi", label: "Loan EMI", icon: "🏦", color: "#f59e0b" },
  { key: "creditCard", label: "Credit Card", icon: "💳", color: "#ef4444" },
  { key: "food", label: "Food & Dining", icon: "🍽️", color: "#10b981" },
  { key: "groceries", label: "Groceries", icon: "🛒", color: "#14b8a6" },
  { key: "transport", label: "Transport", icon: "🚗", color: "#3b82f6" },
  { key: "subscriptions", label: "Subscriptions", icon: "📱", color: "#8b5cf6" },
  { key: "savings", label: "Savings / Investment", icon: "💰", color: "#059669" },
  { key: "insurance", label: "Insurance", icon: "🛡️", color: "#0ea5e9" },
  { key: "medical", label: "Medical / Health", icon: "🏥", color: "#f97316" },
  { key: "education", label: "Education", icon: "📚", color: "#a855f7" },
  { key: "luxury", label: "Luxury / Fashion", icon: "👗", color: "#ec4899" },
  { key: "entertainment", label: "Entertainment", icon: "🎬", color: "#fb7185" },
  { key: "utilities", label: "Utilities", icon: "⚡", color: "#fbbf24" },
  { key: "other", label: "Other", icon: "📦", color: "#94a3b8" },
];

const fmt = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const today = () => new Date().toISOString().split("T")[0];
const getWeek = (d) => { const dt = new Date(d); const day = dt.getDay(); const diff = dt.getDate() - day + (day === 0 ? -6 : 1); return new Date(dt.setDate(diff)).toISOString().split("T")[0]; };
const getMonth = (d) => d.slice(0, 7);

const TABS = ["Dashboard", "Add Entry", "History", "Analytics"];

const initialExpenses = {};
EXPENSE_CATEGORIES.forEach(c => { initialExpenses[c.key] = ""; });

export default function BudgetTracker() {
  const STORAGE_KEY = "budget-tracker-v1";

  // Lazy initializer for bankBalance - load from localStorage immediately
  const [bankBalance, setBankBalance] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw);
      console.debug('[budget-persist] loaded bankBalance:', parsed.bankBalance);
      return parsed.bankBalance || "";
    } catch (e) {
      console.warn('[budget-persist] failed to load bankBalance:', e);
      return "";
    }
  });

  // Lazy initializer for entries - load from localStorage immediately
  const [entries, setEntries] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const loaded = (parsed.entries || []).map(e => ({ ...e, date: String(e.date || "") }));
      console.debug('[budget-persist] loaded entries:', loaded.length, 'items');
      return loaded;
    } catch (e) {
      console.warn('[budget-persist] failed to load entries:', e);
      return [];
    }
  });

  // Lazy initializer for incomes - load from localStorage immediately
  const [incomes, setIncomes] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      const loaded = (parsed.incomes || []).map(i => ({ ...i, date: String(i.date || "") }));
      console.debug('[budget-persist] loaded incomes:', loaded.length, 'items');
      return loaded;
    } catch (e) {
      console.warn('[budget-persist] failed to load incomes:', e);
      return [];
    }
  });

  const [activeTab, setActiveTab] = useState("Dashboard");
  const [incomeForm, setIncomeForm] = useState({ amount: "", type: "salary", date: today(), autoAdd: true });
  const [editingIncomeId, setEditingIncomeId] = useState(null);
  const [activeIncomeId, setActiveIncomeId] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ ...initialExpenses, subName: "", otherName: "", date: today(), note: "", subList: [], otherList: [] });
  const [tempSub, setTempSub] = useState({ name: "", amount: "" });
  const [tempOther, setTempOther] = useState({ name: "", amount: "" });
  const [tempSubIndex, setTempSubIndex] = useState(null);
  const [tempOtherIndex, setTempOtherIndex] = useState(null);
  const incomeDateRef = useRef(null);
  const expenseDateRef = useRef(null);
  const [chartView, setChartView] = useState("monthly");
  const [notification, setNotification] = useState(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");
  const [addingMoney, setAddingMoney] = useState(false);
  const [addMoneyForm, setAddMoneyForm] = useState({ source: "loan_repayment", amount: "", date: today(), note: "" });
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddForm, setQuickAddForm] = useState({ date: today(), category: "food", amount: "", note: "", cardType: "debit" });
  const [expenseCardType, setExpenseCardType] = useState("debit");

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  // Auto-save to localStorage whenever data changes
  useEffect(() => {
    try {
      const toSave = {
        entries: entries.map(e => ({ ...e, date: String(e.date) })),
        incomes: incomes.map(i => ({ ...i, date: String(i.date) })),
        bankBalance: bankBalance
      };
      const json = JSON.stringify(toSave);
      localStorage.setItem(STORAGE_KEY, json);
      console.debug('[budget-persist] saved', { entriesCount: entries.length, incomesCount: incomes.length, bankBalance });
    } catch (e) {
      console.error('[budget-persist] save failed:', e);
    }
  }, [entries, incomes, bankBalance]);

  // Auto-credit income on matching date (monthly recurring)
  useEffect(() => {
    const todayStr = today();
    const [, , dayOfMonth] = todayStr.split('-');
    const currentMonth = todayStr.slice(0, 7); // YYYY-MM
    
    // Only process incomes that need checking
    const toCredit = incomes.filter(inc => 
      inc.autoAdd && 
      (inc.lastCreditedMonth || '') !== currentMonth &&
      inc.date.split('-')[2] === dayOfMonth
    );
    
    if (toCredit.length > 0) {
      const totalToCredit = toCredit.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
      
      setBankBalance(prev => {
        const current = parseFloat(prev) || 0;
        const newBalance = current + totalToCredit;
        console.log(`[auto-credit] Credited ₹${totalToCredit}, new balance: ${newBalance}`);
        return String(newBalance);
      });
      
      setIncomes(prev => prev.map(inc => 
        toCredit.find(t => t.id === inc.id) 
          ? { ...inc, lastCreditedMonth: currentMonth }
          : inc
      ));
      
      showNotif(`Auto income credited: ₹${totalToCredit}`, 'success');
    }
  }, [incomes]); // Re-check when incomes list changes

  const totalExpenses = useMemo(() => {
    return entries.reduce((sum, e) => sum + (e.cardType === "credit" ? 0 : (e.total || 0)), 0);
  }, [entries]);

  const totalCreditCardExpenses = useMemo(() => {
    return entries.reduce((sum, e) => sum + (e.cardType === "credit" ? (e.total || 0) : 0), 0);
  }, [entries]);

  const balance = useMemo(() => {
    const bank = parseFloat(bankBalance) || 0;
    return bank - totalExpenses;
  }, [bankBalance, totalExpenses]);

  const thisMonthEntries = useMemo(() => {
    const m = getMonth(today());
    return entries.filter(e => getMonth(e.date) === m && e.cardType !== "credit");
  }, [entries]);

  const thisMonthTotal = useMemo(() => thisMonthEntries.reduce((s, e) => s + e.total, 0), [thisMonthEntries]);

  const thisWeekEntries = useMemo(() => {
    const w = getWeek(today());
    return entries.filter(e => getWeek(e.date) >= w && e.cardType !== "credit");
  }, [entries]);

  const thisWeekTotal = useMemo(() => thisWeekEntries.reduce((s, e) => s + e.total, 0), [thisWeekEntries]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    EXPENSE_CATEGORIES.forEach(c => { totals[c.key] = 0; });
    entries.forEach(e => {
      if (e.cardType !== "credit") {
        EXPENSE_CATEGORIES.forEach(c => { totals[c.key] += parseFloat(e[c.key] || 0); });
      }
    });
    return totals;
  }, [entries]);

  const pieData = useMemo(() => {
    return EXPENSE_CATEGORIES
      .map(c => ({ name: c.label, value: categoryTotals[c.key], color: c.color, icon: c.icon }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [categoryTotals]);

  const chartData = useMemo(() => {
    const filteredEntries = entries.filter(e => e.cardType !== "credit");
    if (chartView === "monthly") {
      const byMonth = {};
      filteredEntries.forEach(e => {
        const m = getMonth(e.date);
        byMonth[m] = (byMonth[m] || 0) + e.total;
      });
      return Object.entries(byMonth).sort().map(([k, v]) => ({
        label: new Date(k + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        amount: Math.round(v)
      }));
    } else if (chartView === "weekly") {
      const byWeek = {};
      filteredEntries.forEach(e => {
        const w = getWeek(e.date);
        byWeek[w] = (byWeek[w] || 0) + e.total;
      });
      return Object.entries(byWeek).sort().map(([k, v]) => ({
        label: "W " + new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        amount: Math.round(v)
      }));
    } else {
      const byDay = {};
      filteredEntries.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.total; });
      return Object.entries(byDay).sort().slice(-30).map(([k, v]) => ({
        label: new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        amount: Math.round(v)
      }));
    }
  }, [entries, chartView]);

  const savingsRate = useMemo(() => {
    const income = incomes.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    if (!income) return 0;
    return Math.max(0, Math.round(((income - thisMonthTotal) / income) * 100));
  }, [incomes, thisMonthTotal]);

  const handleAddEntry = useCallback(() => {
    // include multiple subscription/other items in sums
    const subsSum = (expenseForm.subList || []).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const otherSum = (expenseForm.otherList || []).reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    const form = { ...expenseForm, subscriptions: subsSum, other: otherSum };

    let total = 0;
    EXPENSE_CATEGORIES.forEach(c => { total += parseFloat(form[c.key] || 0); });
    if (total === 0) { showNotif("Please enter at least one expense amount", "error"); return; }
    const entry = { ...form, total, id: Date.now(), subName: form.subName, otherName: form.otherName, cardType: expenseCardType };
    setEntries(prev => [entry, ...prev]);
    setExpenseForm({ ...initialExpenses, subName: "", otherName: "", date: today(), note: "", subList: [], otherList: [] });
    setTempSub({ name: "", amount: "" });
    setTempOther({ name: "", amount: "" });
    setExpenseCardType("debit");
    showNotif(`Entry of ${fmt(total)} added successfully`);
    setActiveTab("Dashboard");
  }, [expenseForm, expenseCardType]);

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    showNotif("Entry deleted");
  };

  const exportToExcel = useCallback(() => {
    try {
      const wb = XLSX.utils.book_new();
      const entriesSheetData = entries.map(e => {
        const base = { date: e.date, note: e.note || "", cardType: e.cardType || "debit", total: Number(e.total || 0) };
        EXPENSE_CATEGORIES.forEach(c => { base[c.label] = Number(parseFloat(e[c.key] || 0) || 0); });
        return base;
      });
      const es = XLSX.utils.json_to_sheet(entriesSheetData);
      try {
        const rng = XLSX.utils.decode_range(es['!ref']);
        for (let C = rng.s.c; C <= rng.e.c; ++C) {
          const cell = es[XLSX.utils.encode_cell({ c: C, r: rng.s.r })];
          if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF6366F1' } }, alignment: { horizontal: 'center' } };
        }
        const catSet = new Set(EXPENSE_CATEGORIES.map(c => c.label));
        for (let R = rng.s.r + 1; R <= rng.e.r; ++R) {
          for (let C = rng.s.c; C <= rng.e.c; ++C) {
            const cell = es[XLSX.utils.encode_cell({ c: C, r: R })];
            if (!cell) continue;
            const col = es[XLSX.utils.encode_cell({ c: C, r: rng.s.r })];
            const colName = col ? String(col.v || '') : '';
            if (colName === 'total' || catSet.has(colName)) { cell.t = 'n'; cell.v = Number(cell.v || 0); cell.z = '₹#,##0'; }
            if (colName === 'date') { if (typeof cell.v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(cell.v)) { cell.t = 'd'; cell.z = 'yyyy-mm-dd'; } }
          }
        }
        es['!cols'] = [];
        for (let C = rng.s.c; C <= rng.e.c; ++C) es['!cols'].push({ wch: 14 });
        es['!freeze'] = { xSplit: 0, ySplit: 1 };
      } catch (e) { console.warn('entries format:', e); }
      XLSX.utils.book_append_sheet(wb, es, "Entries");
      const categoryRows = EXPENSE_CATEGORIES.map(c => ({ Category: c.label, Total: Number(categoryTotals[c.key] || 0) }));
      const cs = XLSX.utils.json_to_sheet(categoryRows);
      try {
        const rng2 = XLSX.utils.decode_range(cs['!ref']);
        for (let C = rng2.s.c; C <= rng2.e.c; ++C) {
          const cell = cs[XLSX.utils.encode_cell({ c: C, r: rng2.s.r })];
          if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF6366F1' } }, alignment: { horizontal: 'center' } };
        }
        for (let R = rng2.s.r + 1; R <= rng2.e.r; ++R) {
          const cell = cs[XLSX.utils.encode_cell({ c: rng2.s.c + 1, r: R })];
          if (cell) { cell.t = 'n'; cell.v = Number(cell.v || 0); cell.z = '₹#,##0'; }
        }
        cs['!cols'] = [{ wch: 20 }, { wch: 14 }];
      } catch (e) { console.warn('category format:', e); }
      XLSX.utils.book_append_sheet(wb, cs, "Category Totals");
      const summary = [
        { Metric: "Total Expenses (Debit)", Value: totalExpenses },
        { Metric: "Total Credit Card Charges", Value: totalCreditCardExpenses },
        { Metric: "This Month Total", Value: thisMonthTotal },
        { Metric: "This Week Total", Value: thisWeekTotal },
        { Metric: "Bank Balance", Value: bankBalance || 0 },
        { Metric: "Income (sum)", Value: incomes.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0) },
        { Metric: "Savings Rate (%)", Value: savingsRate },
        { Metric: "Total Entries", Value: entries.length },
      ];
      const ss = XLSX.utils.json_to_sheet(summary);
      try {
        const rng3 = XLSX.utils.decode_range(ss['!ref']);
        for (let C = rng3.s.c; C <= rng3.e.c; ++C) {
          const cell = ss[XLSX.utils.encode_cell({ c: C, r: rng3.s.r })];
          if (cell) cell.s = { font: { bold: true, color: { rgb: 'FFFFFFFF' } }, fill: { patternType: 'solid', fgColor: { rgb: 'FF6366F1' } }, alignment: { horizontal: 'center' } };
        }
        for (let R = rng3.s.r + 1; R <= rng3.e.r; ++R) {
          const cell = ss[XLSX.utils.encode_cell({ c: rng3.s.c + 1, r: R })];
          if (cell) { cell.t = 'n'; cell.v = Number(cell.v || 0); cell.z = '₹#,##0'; }
        }
        ss['!cols'] = [{ wch: 24 }, { wch: 14 }];
      } catch (e) { console.warn('summary format:', e); }
      XLSX.utils.book_append_sheet(wb, ss, "Summary");
      const filename = `budget-analytics-${today()}.xlsx`;
      XLSX.writeFile(wb, filename);
      showNotif(`Exported to ${filename}`);
    } catch (err) {
      console.error(err);
      showNotif("Export failed", "error");
    }
  }, [entries, categoryTotals, totalExpenses, totalCreditCardExpenses, thisMonthTotal, thisWeekTotal, bankBalance, incomes, savingsRate]);

  const income = incomes.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
  const budgetUsed = income > 0 ? Math.min((thisMonthTotal / income) * 100, 100) : 0;
  const balanceColor = balance >= 0 ? "#10b981" : "#ef4444";

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "#ffffff", minHeight: "100vh", padding: "0 0 40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono&display=swap');
        :root {
          --color-text-primary: #0f172a; /* slate-900 */
          --color-text-secondary: #334155; /* improved contrast */
          --color-background-primary: #ffffff;
          --color-background-secondary: #f1f5f9; /* slightly stronger card bg for boundaries */
          --color-border-tertiary: #e6eef8;
          --color-border-secondary: #cfd8e3; /* slightly darker border for visibility */
        }
        .tab-btn { padding: 8px 18px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px; font-weight: 700; transition: all 0.2s; background: transparent; color: var(--color-text-secondary); }
        .tab-btn.active { background: #6366f1; color: #fff; }
        .tab-btn:hover:not(.active) { background: var(--color-background-secondary); }
        .tab-btn:focus-visible { outline: 3px solid rgba(99,102,241,0.18); outline-offset: 2px; }
        .card { background: var(--color-background-primary); border-radius: 16px; border: 1px solid var(--color-border-secondary); padding: 20px; box-shadow: 0 1px 6px rgba(16,24,40,0.04); }
        .metric-card { background: var(--color-background-secondary); border-radius: 12px; padding: 16px; }
        .inp { width: 100%; padding: 10px 12px; border-radius: 8px; border: 0.5px solid var(--color-border-secondary); font-size: 15px; background: var(--color-background-secondary); color: var(--color-text-primary); box-sizing: border-box; font-family: inherit; }
        .inp:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .btn-primary { background: #6366f1; color: white; border: none; border-radius: 10px; padding: 11px 24px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .btn-primary:focus-visible { box-shadow: 0 0 0 4px rgba(99,102,241,0.18); outline: none; }
        .btn-primary:hover { background: #4f46e5; }
        .btn-sm { padding: 6px 12px; border-radius: 6px; border: 0.5px solid var(--color-border-secondary); background: transparent; color: var(--color-text-primary); font-size: 13px; cursor: pointer; font-family: inherit; }
        .btn-sm:hover { background: var(--color-background-secondary); }
        .btn-sm:focus-visible { box-shadow: 0 0 0 4px rgba(99,102,241,0.12); outline: none; }
        .chart-toggle button { padding: 6px 14px; font-size: 12px; border: 0.5px solid var(--color-border-secondary); background: transparent; cursor: pointer; color: var(--color-text-secondary); font-family: inherit; transition: all 0.15s; }
        .chart-toggle button:first-child { border-radius: 8px 0 0 8px; }
        .chart-toggle button:last-child { border-radius: 0 8px 8px 0; }
        .chart-toggle button.active { background: #6366f1; color: white; border-color: #6366f1; }
        .notif { position: fixed; top: 20px; right: 20px; padding: 12px 20px; border-radius: 10px; font-size: 13px; font-weight: 500; z-index: 999; animation: slideIn 0.3s ease; }
        .notif.success { background: #10b981; color: white; }
        .notif.error { background: #ef4444; color: white; }
        @keyframes slideIn { from { transform: translateX(40px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .progress-bar { height: 6px; border-radius: 3px; background: var(--color-background-secondary); overflow: hidden; }
        .progress-fill { height: 100%; border-radius: 3px; transition: width 0.6s ease; }
        label { font-size: 12px; color: var(--color-text-secondary); font-weight: 500; display: block; margin-bottom: 5px; }
        .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-text-secondary); margin: 0 0 12px; }
        .expense-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        @media (max-width: 600px) { .expense-row { grid-template-columns: 1fr; } .tab-btn { padding: 7px 12px; font-size: 12px; } }
        .history-item { display: flex; justify-content: space-between; align-items: flex-start; padding: 14px 16px; border-radius: 10px; border: 0.5px solid var(--color-border-tertiary); margin-bottom: 8px; background: var(--color-background-primary); }
        .cat-pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 8px; border-radius: 20px; font-size: 11px; font-weight: 500; margin: 2px; }
        .balance-chip { display: inline-block; padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 600; }
        .insight-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 0.5px solid var(--color-border-tertiary); }
        .insight-row:last-child { border-bottom: none; }
      `}</style>

      {notification && <div className={`notif ${notification.type}`} role="status" aria-live="polite">{notification.msg}</div>}

      {/* Header */}
      <div style={{ background: "var(--color-background-primary)", borderBottom: "0.5px solid var(--color-border-tertiary)", padding: "16px 20px 0", position: "sticky", top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.3px" }}>💼 Budget Tracker</h1>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-secondary)" }}>
                {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn-sm" onClick={exportToExcel} aria-label="Export analytics to Excel">📥 Export to Excel</button>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Balance</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: balanceColor, fontFamily: "'DM Mono', monospace" }}>{fmt(balance)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 0 }}>
            {TABS.map(t => (
              <button key={t} className={`tab-btn ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)} aria-pressed={activeTab === t} aria-label={`Tab ${t}`}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "20px auto", padding: "0 16px" }}>

        {/* DASHBOARD */}
        {activeTab === "Dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Setup Cards */}
            <div>
              <p className="section-title">Account Setup</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
                <div className="card" style={{ flex: '1 1 320px', minWidth: 260 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label>Bank Balance (₹)</label>
                      {editingBalance ? (
                        <div style={{ display: "flex", gap: 8, alignItems: 'center' }}>
                          <input className="inp" aria-label="Edit bank balance" type="number" value={tempBalance} onChange={e => setTempBalance(e.target.value)} placeholder="0" autoFocus />
                          <button className="btn-primary" aria-label="Save bank balance" style={{ padding: "9px 14px", whiteSpace: "nowrap" }} onClick={() => { setBankBalance(tempBalance); setEditingBalance(false); showNotif("Balance updated"); }}>Save</button>
                        </div>
                      ) : (
                        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
                          <div style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "var(--color-background-secondary)", fontSize: 16, fontWeight: 700, color: "var(--color-text-primary)", fontFamily: "'DM Mono', monospace", textAlign: 'left' }}>{bankBalance ? fmt(bankBalance) : "Not set"}</div>
                          <button className="btn-sm" aria-label="Edit bank balance" onClick={() => { setTempBalance(bankBalance); setEditingBalance(true); }}>Edit</button>
                        </div>
                      )}
                      {!editingBalance && (
                        <button className="btn-sm" aria-label="Add money from other sources" onClick={() => setAddingMoney(true)} style={{ width: '100%' }}>+ Add Money</button>
                      )}
                      {addingMoney && !editingBalance && (
                        <div style={{ marginTop: 12, padding: 12, borderRadius: 8, background: "var(--color-background-secondary)" }}>
                          <label style={{ display: 'block', marginBottom: 8 }}>Source</label>
                          <select className="inp" aria-label="Money source" value={addMoneyForm.source} onChange={e => setAddMoneyForm(f => ({ ...f, source: e.target.value }))} style={{ marginBottom: 8 }}>
                            <option value="loan_repayment">Loan Repayment</option>
                            <option value="gift">Gift</option>
                            <option value="refund">Refund</option>
                            <option value="transfer">Transfer</option>
                            <option value="other">Other</option>
                          </select>
                          <label style={{ display: 'block', marginBottom: 8 }}>Amount (₹)</label>
                          <input className="inp" aria-label="Amount to add" type="number" placeholder="0" value={addMoneyForm.amount} onChange={e => setAddMoneyForm(f => ({ ...f, amount: e.target.value }))} style={{ marginBottom: 8 }} />
                          <label style={{ display: 'block', marginBottom: 8 }}>Date</label>
                          <input className="inp" aria-label="Date" type="date" value={addMoneyForm.date} onChange={e => setAddMoneyForm(f => ({ ...f, date: e.target.value }))} style={{ marginBottom: 8 }} />
                          <label style={{ display: 'block', marginBottom: 8 }}>Note (optional)</label>
                          <input className="inp" aria-label="Note" type="text" placeholder="e.g., loan repayment from friend" value={addMoneyForm.note} onChange={e => setAddMoneyForm(f => ({ ...f, note: e.target.value }))} style={{ marginBottom: 8 }} />
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button className="btn-primary" onClick={() => {
                              if (!addMoneyForm.amount) return showNotif('Enter amount', 'error');
                              const amount = parseFloat(addMoneyForm.amount) || 0;
                              setBankBalance(prev => String((parseFloat(prev) || 0) + amount));
                              showNotif(`Added ₹${fmt(amount)} from ${addMoneyForm.source.replace('_', ' ')}`);
                              setAddingMoney(false);
                              setAddMoneyForm({ source: 'loan_repayment', amount: '', date: today(), note: '' });
                            }} style={{ flex: 1 }}>Save</button>
                            <button className="btn-sm" onClick={() => { setAddingMoney(false); setAddMoneyForm({ source: 'loan_repayment', amount: '', date: today(), note: '' }); }} style={{ flex: 1 }}>Cancel</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="card" style={{ flex: '1 1 420px', minWidth: 300 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: 8 }}>Monthly Incomes</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                        {(incomes || []).map(inc => (
                          <button key={inc.id} className={`tab-btn ${activeIncomeId === inc.id ? 'active' : ''}`} onClick={() => setActiveIncomeId(inc.id)} style={{ padding: '6px 12px', fontSize: 12 }} aria-pressed={activeIncomeId === inc.id} aria-label={`Income ${inc.type} ${fmt(inc.amount)}`}>{inc.type} {fmt(inc.amount)}</button>
                        ))}
                        <div style={{ flex: 1 }} />
                      </div>

                      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                        <select className="inp" aria-label="Income type" style={{ width: 'auto', minWidth: 110 }} value={incomeForm.type} onChange={e => setIncomeForm(f => ({ ...f, type: e.target.value }))}>
                          <option value="salary">Salary</option>
                          <option value="freelance">Freelance</option>
                          <option value="business">Business</option>
                          <option value="rental">Rental</option>
                          <option value="other">Other</option>
                        </select>
                        <input className="inp" aria-label="Income amount" type="number" placeholder="Amount" inputMode="numeric" style={{ flex: 1, minWidth: 120, color: 'var(--color-text-primary)', background: '#ffffff' }} value={incomeForm.amount} onChange={e => setIncomeForm(f => ({ ...f, amount: e.target.value }))} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input ref={incomeDateRef} className="inp" aria-label="Income date" type="date" style={{ width: 140, background: '#ffffff', color: 'var(--color-text-primary)' }} value={incomeForm.date} onChange={e => setIncomeForm(f => ({ ...f, date: e.target.value }))} onClick={() => incomeDateRef.current?.showPicker?.()} onFocus={() => incomeDateRef.current?.showPicker?.()} />
                          <button className="btn-sm" aria-label="Open income calendar" onClick={() => incomeDateRef.current?.showPicker?.()}>📅</button>
                        </div>
                        <label title="If enabled, this income will be automatically added on the chosen date each month and update bank balance." style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input type="checkbox" aria-label="Auto add income" checked={!!incomeForm.autoAdd} onChange={e => setIncomeForm(f => ({ ...f, autoAdd: e.target.checked }))} /> Auto
                        </label>
                        <button className="btn-sm" onClick={() => {
                          if (!incomeForm.amount) return showNotif('Enter income amount', 'error');
                          if (editingIncomeId) {
                            setIncomes(prev => prev.map(i => i.id === editingIncomeId ? ({ ...i, ...incomeForm }) : i));
                            setActiveIncomeId(editingIncomeId);
                            setEditingIncomeId(null);
                          } else {
                            const id = Date.now();
                            setIncomes(prev => [{ id, ...incomeForm }, ...prev]);
                            setActiveIncomeId(id);
                          }
                          setIncomeForm({ amount: '', type: 'salary', date: today(), autoAdd: true });
                        }}>{editingIncomeId ? 'Save' : 'Add'}</button>
                      </div>

                      {activeIncomeId && (() => {
                        const inc = incomes.find(i => i.id === activeIncomeId);
                        if (!inc) return null;
                        return (
                          <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'var(--color-background-secondary)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div>
                                <div style={{ fontSize: 14, fontWeight: 600 }}>{inc.type} — {fmt(inc.amount)}</div>
                                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{inc.date} · {inc.autoAdd ? 'Auto' : 'Manual'}</div>
                              </div>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <button className="btn-sm" onClick={() => { setIncomeForm({ amount: inc.amount, type: inc.type, date: inc.date, autoAdd: !!inc.autoAdd }); setEditingIncomeId(inc.id); }}>Edit</button>
                                <button className="btn-sm" onClick={() => { setIncomes(prev => prev.filter(i => i.id !== inc.id)); setActiveIncomeId(null); }}>Delete</button>
                              </div>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                  { label: "Bank Balance", val: fmt(balance), sub: "Remaining", color: "#6366f1" },
                  { label: "This Month", val: fmt(thisMonthTotal), sub: `${thisMonthEntries.length} entries`, color: "#ef4444" },
                  { label: "This Week", val: fmt(thisWeekTotal), sub: `${thisWeekEntries.length} entries`, color: "#f59e0b" },
                  { label: "Money Left", val: fmt(balance), sub: "After expenses", color: balanceColor },
                ].map(m => (
                <div className="metric-card" key={m.label}>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", fontWeight: 500, marginBottom: 6 }}>{m.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 600, color: m.color, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.5px" }}>{m.val}</div>
                  <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginTop: 3 }}>{m.sub}</div>
                </div>
              ))}
            </div>

            {/* Budget Progress */}
            {income > 0 && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <p className="section-title" style={{ margin: 0 }}>Monthly Budget Used</p>
                  <span style={{ fontSize: 13, fontWeight: 600, color: budgetUsed > 80 ? "#ef4444" : budgetUsed > 60 ? "#f59e0b" : "#10b981" }}>{Math.round(budgetUsed)}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${budgetUsed}%`, background: budgetUsed > 80 ? "#ef4444" : budgetUsed > 60 ? "#f59e0b" : "#10b981" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8, fontSize: 12, color: "var(--color-text-secondary)" }}>
                  <span>Spent: {fmt(thisMonthTotal)}</span>
                  <span>Remaining: {fmt(Math.max(0, income - thisMonthTotal))}</span>
                  <span>Income: {fmt(income)}</span>
                </div>
                {savingsRate > 0 && (
                  <div style={{ marginTop: 10, padding: "8px 12px", borderRadius: 8, background: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16 }}>💰</span>
                    <span style={{ fontSize: 13, color: "#059669", fontWeight: 500 }}>Savings Rate: {savingsRate}% — {savingsRate >= 20 ? "Great job!" : "Aim for 20%+"}</span>
                  </div>
                )}
              </div>
            )}

            {/* Category Breakdown */}
            {pieData.length > 0 && (
              <div className="card">
                <p className="section-title">Top Spending Categories</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {pieData.slice(0, 6).map(d => (
                    <div key={d.name} className="insight-row">
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 18 }}>{d.icon}</span>
                        <span style={{ fontSize: 14, color: "var(--color-text-primary)", fontWeight: 500 }}>{d.name}</span>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Mono', monospace" }}>{fmt(d.value)}</div>
                        <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{income > 0 ? Math.round((d.value / income) * 100) + "% of income" : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Spending Trend Chart */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p className="section-title" style={{ margin: 0 }}>Spending Trend</p>
                <div className="chart-toggle">
                  {["daily", "weekly", "monthly"].map(v => (
                    <button key={v} className={chartView === v ? "active" : ""} onClick={() => setChartView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                  ))}
                </div>
              </div>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 0, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip wrapperStyle={{ zIndex: 1000 }} formatter={v => [fmt(v), "Spent"]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
                    <Bar dataKey="amount" fill="#6366f1" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>
                  No spending data yet. Add some expenses!
                </div>
              )}
            </div>

            {/* Pie Chart */}
            {pieData.length > 0 && (
              <div className="card">
                <p className="section-title">Spending Distribution</p>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={2} dataKey="value">
                      {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip wrapperStyle={{ zIndex: 1000 }} formatter={(v, name) => [fmt(v), name]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} />
                    <Legend formatter={(val) => <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{val}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Quick add button */}
            <button className="btn-primary" onClick={() => setActiveTab("Add Entry")} style={{ width: "100%", padding: 14, fontSize: 15, borderRadius: 12 }}>
              + Add Expense Entry
            </button>
          </div>
        )}

        {/* ADD ENTRY */}
        {activeTab === "Add Entry" && (
          <div className="card">
            <p className="section-title">New Expense Entry</p>

            <div style={{ marginBottom: 16 }}>
              <label>Payment Method</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={() => setExpenseCardType("debit")} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: expenseCardType === "debit" ? '2px solid #6366f1' : '1px solid var(--color-border-secondary)', background: expenseCardType === "debit" ? 'rgba(99,102,241,0.1)' : 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} aria-pressed={expenseCardType === "debit"}>💳 Debit Card</button>
                <button onClick={() => setExpenseCardType("credit")} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: expenseCardType === "credit" ? '2px solid #6366f1' : '1px solid var(--color-border-secondary)', background: expenseCardType === "credit" ? 'rgba(99,102,241,0.1)' : 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} aria-pressed={expenseCardType === "credit"}>💰 Credit Card</button>
              </div>
              {expenseCardType === "credit" && (
                <div style={{ marginTop: 8, padding: 10, borderRadius: 8, background: 'rgba(251,191,36,0.08)', fontSize: 13, color: '#92400e' }}>
                  ℹ️ Credit card charges won't be deducted from bank balance and won't count in spending analytics until paid.
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label>Entry Date</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input ref={expenseDateRef} className="inp" aria-label="Entry date" type="date" value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} onClick={() => expenseDateRef.current?.showPicker?.()} onFocus={() => expenseDateRef.current?.showPicker?.()} />
                <button className="btn-sm" aria-label="Open entry calendar" onClick={() => expenseDateRef.current?.showPicker?.()}>📅</button>
              </div>
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Fixed Expenses</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(0, 4).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" aria-label={`Amount for ${c.label}`} type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
              <div>
                <label>💰 Savings / SIP</label>
                <input className="inp" aria-label="Savings amount" type="number" placeholder="0" value={expenseForm.savings} onChange={e => setExpenseForm(p => ({ ...p, savings: e.target.value }))} />
              </div>
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Variable Expenses</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(4, 8).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" aria-label={`Amount for ${c.label}`} type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            {/* Subscriptions (multiple) */}
            <div style={{ marginBottom: 12 }}>
              <label>📱 Subscriptions (add multiple)</label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input className="inp" aria-label="Subscription name" placeholder="Name" value={tempSub.name} onChange={e => setTempSub(s => ({ ...s, name: e.target.value }))} />
                <input className="inp" aria-label="Subscription amount" placeholder="Amount" type="number" value={tempSub.amount} onChange={e => setTempSub(s => ({ ...s, amount: e.target.value }))} />
                <button className="btn-sm" onClick={() => {
                  if (!tempSub.name || !tempSub.amount) return showNotif('Enter name and amount', 'error');
                  if (tempSubIndex !== null) {
                    setExpenseForm(p => {
                      const list = [...(p.subList || [])];
                      list[tempSubIndex] = { name: tempSub.name, amount: tempSub.amount };
                      return { ...p, subList: list };
                    });
                    setTempSubIndex(null);
                  } else {
                    setExpenseForm(p => ({ ...p, subList: [...(p.subList || []), { name: tempSub.name, amount: tempSub.amount }] }));
                  }
                  setTempSub({ name: '', amount: '' });
                }}>{tempSubIndex !== null ? 'Save' : 'Add'}</button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(expenseForm.subList || []).map((s, i) => (
                  <div key={i} className="cat-pill" style={{ background: '#f1f5f9', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn-sm" onClick={() => { setTempSub({ name: s.name, amount: s.amount }); setTempSubIndex(i); }} style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit' }}>{s.name}: {fmt(s.amount)}</button>
                    <button className="btn-sm" style={{ marginLeft: 6 }} onClick={() => setExpenseForm(p => ({ ...p, subList: p.subList.filter((_, idx) => idx !== i) }))}>x</button>
                  </div>
                ))}
              </div>
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Savings & Wellbeing</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(8, 15).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" aria-label={`Amount for ${c.label}`} type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Other</p>
            <div className="expense-row" style={{ marginBottom: 12 }}>
              <div>
                <label>📦 Other Expense Name</label>
                <input className="inp" aria-label="Other expense name" type="text" placeholder="What did you spend on?" value={expenseForm.otherName} onChange={e => setExpenseForm(p => ({ ...p, otherName: e.target.value }))} />
              </div>
              <div>
                <label>📦 Other Amount (₹)</label>
                <input className="inp" aria-label="Other amount" type="number" placeholder="0" value={expenseForm.other} onChange={e => setExpenseForm(p => ({ ...p, other: e.target.value }))} />
              </div>
            </div>

            {/* Other items (multiple) */}
            <div style={{ marginBottom: 12 }}>
              <label>📦 Other items (add multiple)</label>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <input className="inp" aria-label="Other item name" placeholder="Name" value={tempOther.name} onChange={e => setTempOther(s => ({ ...s, name: e.target.value }))} />
                <input className="inp" aria-label="Other item amount" placeholder="Amount" type="number" value={tempOther.amount} onChange={e => setTempOther(s => ({ ...s, amount: e.target.value }))} />
                <button className="btn-sm" onClick={() => {
                  if (!tempOther.name || !tempOther.amount) return showNotif('Enter name and amount', 'error');
                  if (tempOtherIndex !== null) {
                    setExpenseForm(p => {
                      const list = [...(p.otherList || [])];
                      list[tempOtherIndex] = { name: tempOther.name, amount: tempOther.amount };
                      return { ...p, otherList: list };
                    });
                    setTempOtherIndex(null);
                  } else {
                    setExpenseForm(p => ({ ...p, otherList: [...(p.otherList || []), { name: tempOther.name, amount: tempOther.amount }] }));
                  }
                  setTempOther({ name: '', amount: '' });
                }}>{tempOtherIndex !== null ? 'Save' : 'Add'}</button>
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {(expenseForm.otherList || []).map((s, i) => (
                  <div key={i} className="cat-pill" style={{ background: '#f1f5f9', color: '#0f172a', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button className="btn-sm" onClick={() => { setTempOther({ name: s.name, amount: s.amount }); setTempOtherIndex(i); }} style={{ background: 'transparent', border: 'none', padding: 0, color: 'inherit' }}>{s.name}: {fmt(s.amount)}</button>
                    <button className="btn-sm" style={{ marginLeft: 6 }} onClick={() => setExpenseForm(p => ({ ...p, otherList: p.otherList.filter((_, idx) => idx !== i) }))}>x</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Note (optional)</label>
              <input className="inp" aria-label="Entry note" type="text" placeholder="Any notes for this entry..." value={expenseForm.note} onChange={e => setExpenseForm(p => ({ ...p, note: e.target.value }))} />
            </div>

            {/* Total Preview */}
            <div style={{ background: "rgba(99,102,241,0.08)", borderRadius: 10, padding: "12px 16px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 14, color: "var(--color-text-secondary)", fontWeight: 500 }}>Entry Total</span>
              <span style={{ fontSize: 22, fontWeight: 600, color: "#6366f1", fontFamily: "'DM Mono', monospace" }}>
                {fmt(EXPENSE_CATEGORIES.reduce((s, c) => s + (parseFloat(expenseForm[c.key] || 0)), 0))}
              </span>
            </div>

            <button className="btn-primary" onClick={handleAddEntry} style={{ width: "100%", padding: 13, fontSize: 15, borderRadius: 12 }}>
              Save Entry
            </button>
          </div>
        )}

        {/* QUICK ADD MODAL */}
        {quickAddOpen && (
          <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 999, padding: '16px' }}>
            <div className="card" style={{ maxWidth: 600, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>⚡ Quick Add</h2>
                <button onClick={() => setQuickAddOpen(false)} style={{ background: 'none', border: 'none', fontSize: 24, cursor: 'pointer', color: 'var(--color-text-secondary)' }} aria-label="Close quick add">×</button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Payment Method</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setQuickAddForm(f => ({ ...f, cardType: "debit" }))} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: quickAddForm.cardType === "debit" ? '2px solid #6366f1' : '1px solid var(--color-border-secondary)', background: quickAddForm.cardType === "debit" ? 'rgba(99,102,241,0.1)' : 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} aria-pressed={quickAddForm.cardType === "debit"}>💳 Debit</button>
                  <button onClick={() => setQuickAddForm(f => ({ ...f, cardType: "credit" }))} style={{ flex: 1, padding: '10px 14px', borderRadius: 8, border: quickAddForm.cardType === "credit" ? '2px solid #6366f1' : '1px solid var(--color-border-secondary)', background: quickAddForm.cardType === "credit" ? 'rgba(99,102,241,0.1)' : 'var(--color-background-secondary)', color: 'var(--color-text-primary)', fontWeight: 500, cursor: 'pointer', transition: 'all 0.2s' }} aria-pressed={quickAddForm.cardType === "credit"}>💰 Credit</button>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Date</label>
                <input className="inp" type="date" value={quickAddForm.date} onChange={e => setQuickAddForm(f => ({ ...f, date: e.target.value }))} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Category</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(70px, 1fr))', gap: 8 }}>
                  {EXPENSE_CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setQuickAddForm(f => ({ ...f, category: c.key }))} style={{ padding: 12, borderRadius: 8, border: quickAddForm.category === c.key ? `2px solid ${c.color}` : '1px solid var(--color-border-secondary)', background: quickAddForm.category === c.key ? `${c.color}18` : 'var(--color-background-secondary)', cursor: 'pointer', fontSize: 20, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, fontFamily: 'inherit', transition: 'all 0.2s' }}>
                      <span>{c.icon}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 500, textAlign: 'center' }}>{c.label.split('/')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Amount (₹)</label>
                <input className="inp" type="number" placeholder="0" value={quickAddForm.amount} onChange={e => setQuickAddForm(f => ({ ...f, amount: e.target.value }))} autoFocus />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label>Note (optional)</label>
                <input className="inp" type="text" placeholder="e.g., lunch at office..." value={quickAddForm.note} onChange={e => setQuickAddForm(f => ({ ...f, note: e.target.value }))} />
              </div>

              <button className="btn-primary" onClick={() => {
                if (!quickAddForm.amount) return showNotif('Enter amount', 'error');
                const amount = parseFloat(quickAddForm.amount) || 0;
                const category = EXPENSE_CATEGORIES.find(c => c.key === quickAddForm.category);
                const entry = {
                  ...initialExpenses,
                  [quickAddForm.category]: String(amount),
                  date: quickAddForm.date,
                  note: quickAddForm.note,
                  total: amount,
                  id: Date.now(),
                  subList: [],
                  otherList: [],
                  cardType: quickAddForm.cardType
                };
                setEntries(prev => [entry, ...prev]);
                showNotif(`Added ${fmt(amount)} to ${category?.label}`);
                setQuickAddOpen(false);
                setQuickAddForm({ date: today(), category: 'food', amount: '', note: '', cardType: 'debit' });
              }} style={{ width: '100%', padding: 13, fontSize: 15 }}>
                Save Expense
              </button>
            </div>
          </div>
        )}

        {/* Quick Add FAB - visible on all tabs */}
        <button onClick={() => setQuickAddOpen(true)} style={{ position: 'fixed', bottom: 20, right: 20, width: 56, height: 56, borderRadius: '50%', background: '#6366f1', color: 'white', border: 'none', fontSize: 28, cursor: 'pointer', boxShadow: '0 4px 12px rgba(99,102,241,0.3)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s', fontFamily: 'inherit' }} onMouseEnter={e => e.target.style.background = '#4f46e5'} onMouseLeave={e => e.target.style.background = '#6366f1'} aria-label="Quick add expense">+</button>

        {/* HISTORY */}
        {activeTab === "History" && (
          <div>
            {entries.length === 0 ? (
              <div className="card" style={{ textAlign: "center", padding: 40 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p style={{ color: "var(--color-text-secondary)", margin: 0 }}>No entries yet. Add your first expense!</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                  <p className="section-title" style={{ margin: 0 }}>{entries.length} total entries</p>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>Total: {fmt(totalExpenses)}</span>
                </div>
                {entries.map(e => {
                  const cats = EXPENSE_CATEGORIES.filter(c => parseFloat(e[c.key] || 0) > 0);
                  return (
                    <div key={e.id} className="history-item">
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                            {new Date(e.date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                          <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: e.cardType === 'credit' ? 'rgba(251,191,36,0.2)' : 'rgba(16,185,129,0.2)', color: e.cardType === 'credit' ? '#92400e' : '#047857', fontWeight: 500 }}>{e.cardType === 'credit' ? '💳 Credit' : '💰 Debit'}</span>
                          {e.note && <span style={{ fontSize: 12, color: "var(--color-text-secondary)", fontStyle: "italic" }}>— {e.note}</span>}
                        </div>
                        <div style={{ flexWrap: "wrap", display: "flex" }}>
                          {cats.slice(0, 5).map(c => (
                            <span key={c.key} className="cat-pill" style={{ background: c.color + "18", color: c.color }}>
                              {c.icon} {c.key === "subscriptions" && e.subName ? e.subName : c.key === "other" && e.otherName ? e.otherName : c.label}: {fmt(e[c.key])}
                            </span>
                          ))}
                          {cats.length > 5 && <span className="cat-pill" style={{ background: "var(--color-background-secondary)", color: "var(--color-text-secondary)" }}>+{cats.length - 5} more</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", marginLeft: 12 }}>
                        <div style={{ fontSize: 16, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Mono', monospace" }}>{fmt(e.total)}</div>
                        <button className="btn-sm" style={{ marginTop: 6, color: "#ef4444", borderColor: "#ef444440" }} onClick={() => deleteEntry(e.id)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ANALYTICS */}
        {activeTab === "Analytics" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div className="metric-card">
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>Avg Monthly</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#6366f1", fontFamily: "'DM Mono', monospace" }}>
                  {entries.length > 0 ? fmt(totalExpenses / Math.max(1, new Set(entries.map(e => getMonth(e.date))).size)) : "—"}
                </div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>Savings Rate</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: savingsRate >= 20 ? "#10b981" : "#f59e0b", fontFamily: "'DM Mono', monospace" }}>{savingsRate}%</div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>Highest Day</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "#ef4444", fontFamily: "'DM Mono', monospace" }}>
                  {chartData.length > 0 ? fmt(Math.max(...chartData.map(d => d.amount))) : "—"}
                </div>
              </div>
              <div className="metric-card">
                <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 6 }}>Total Entries</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Mono', monospace" }}>{entries.length}</div>
              </div>
            </div>

            <div className="card">
              <p className="section-title">All Category Totals</p>
              {EXPENSE_CATEGORIES.map(c => {
                const val = categoryTotals[c.key];
                if (!val) return null;
                const pct = totalExpenses > 0 ? (val / totalExpenses) * 100 : 0;
                return (
                  <div key={c.key} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, color: "var(--color-text-primary)" }}>{c.icon} {c.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: c.color, fontFamily: "'DM Mono', monospace" }}>{fmt(val)} <span style={{ fontWeight: 400, color: "var(--color-text-secondary)", fontSize: 11 }}>({Math.round(pct)}%)</span></span>
                    </div>
                    <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${pct}%`, background: c.color }} />
                    </div>
                  </div>
                );
              })}
              {totalExpenses === 0 && <p style={{ color: "var(--color-text-secondary)", fontSize: 14, textAlign: "center", padding: 20 }}>No spending data yet.</p>}
            </div>

            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <p className="section-title" style={{ margin: 0 }}>Spending Trend</p>
                <div className="chart-toggle">
                  {["daily", "weekly", "monthly"].map(v => (
                    <button key={v} className={chartView === v ? "active" : ""} onClick={() => setChartView(v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
                  ))}
                </div>
              </div>
              {chartData.length > 1 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary)" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--color-text-secondary)" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${(v / 1000).toFixed(0)}k`} />
                    <Tooltip wrapperStyle={{ zIndex: 1000 }} formatter={v => [fmt(v), "Spent"]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} />
                    <Line type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={2} dot={{ fill: "#6366f1", r: 3 }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-secondary)", fontSize: 14 }}>Add more entries to see trends</div>
              )}
            </div>

            {income > 0 && (
              <div className="card">
                <p className="section-title">Financial Health Score</p>
                {[
                  { label: "Savings Rate", val: savingsRate, target: 20, unit: "%", tip: "Target ≥20%" },
                  { label: "Housing (% of income)", val: income > 0 ? Math.round((categoryTotals.rent / income) * 100) : 0, target: 30, unit: "%", tip: "Target ≤30%", invert: true },
                  { label: "Debt payments (EMI+CC)", val: income > 0 ? Math.round(((categoryTotals.loanEmi + categoryTotals.creditCard) / income) * 100) : 0, target: 20, unit: "%", tip: "Target ≤20%", invert: true },
                ].map(item => (
                  <div key={item.label} className="insight-row">
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "var(--color-text-secondary)" }}>{item.tip}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <span style={{ fontSize: 15, fontWeight: 600, color: item.invert ? (item.val <= item.target ? "#10b981" : "#ef4444") : (item.val >= item.target ? "#10b981" : "#f59e0b") }}>
                        {item.val}{item.unit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

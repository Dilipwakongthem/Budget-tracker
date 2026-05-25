import { useState, useMemo, useCallback } from "react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

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
  const [activeTab, setActiveTab] = useState("Dashboard");
  const [bankBalance, setBankBalance] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [incomeType, setIncomeType] = useState("salary");
  const [entries, setEntries] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ ...initialExpenses, subName: "", otherName: "", date: today(), note: "" });
  const [chartView, setChartView] = useState("monthly");
  const [notification, setNotification] = useState(null);
  const [editingBalance, setEditingBalance] = useState(false);
  const [tempBalance, setTempBalance] = useState("");

  const showNotif = (msg, type = "success") => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const totalExpenses = useMemo(() => {
    return entries.reduce((sum, e) => sum + (e.total || 0), 0);
  }, [entries]);

  const balance = useMemo(() => {
    const bank = parseFloat(bankBalance) || 0;
    return bank - totalExpenses;
  }, [bankBalance, totalExpenses]);

  const thisMonthEntries = useMemo(() => {
    const m = getMonth(today());
    return entries.filter(e => getMonth(e.date) === m);
  }, [entries]);

  const thisMonthTotal = useMemo(() => thisMonthEntries.reduce((s, e) => s + e.total, 0), [thisMonthEntries]);

  const thisWeekEntries = useMemo(() => {
    const w = getWeek(today());
    return entries.filter(e => getWeek(e.date) >= w);
  }, [entries]);

  const thisWeekTotal = useMemo(() => thisWeekEntries.reduce((s, e) => s + e.total, 0), [thisWeekEntries]);

  const categoryTotals = useMemo(() => {
    const totals = {};
    EXPENSE_CATEGORIES.forEach(c => { totals[c.key] = 0; });
    entries.forEach(e => {
      EXPENSE_CATEGORIES.forEach(c => { totals[c.key] += parseFloat(e[c.key] || 0); });
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
    if (chartView === "monthly") {
      const byMonth = {};
      entries.forEach(e => {
        const m = getMonth(e.date);
        byMonth[m] = (byMonth[m] || 0) + e.total;
      });
      return Object.entries(byMonth).sort().map(([k, v]) => ({
        label: new Date(k + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" }),
        amount: Math.round(v)
      }));
    } else if (chartView === "weekly") {
      const byWeek = {};
      entries.forEach(e => {
        const w = getWeek(e.date);
        byWeek[w] = (byWeek[w] || 0) + e.total;
      });
      return Object.entries(byWeek).sort().map(([k, v]) => ({
        label: "W " + new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        amount: Math.round(v)
      }));
    } else {
      const byDay = {};
      entries.forEach(e => { byDay[e.date] = (byDay[e.date] || 0) + e.total; });
      return Object.entries(byDay).sort().slice(-30).map(([k, v]) => ({
        label: new Date(k).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        amount: Math.round(v)
      }));
    }
  }, [entries, chartView]);

  const savingsRate = useMemo(() => {
    const income = parseFloat(monthlyIncome) || 0;
    if (!income) return 0;
    return Math.max(0, Math.round(((income - thisMonthTotal) / income) * 100));
  }, [monthlyIncome, thisMonthTotal]);

  const handleAddEntry = useCallback(() => {
    let total = 0;
    EXPENSE_CATEGORIES.forEach(c => { total += parseFloat(expenseForm[c.key] || 0); });
    if (total === 0) { showNotif("Please enter at least one expense amount", "error"); return; }
    const entry = { ...expenseForm, total, id: Date.now(), subName: expenseForm.subName, otherName: expenseForm.otherName };
    setEntries(prev => [entry, ...prev]);
    setExpenseForm({ ...initialExpenses, subName: "", otherName: "", date: today(), note: "" });
    showNotif(`Entry of ${fmt(total)} added successfully`);
    setActiveTab("Dashboard");
  }, [expenseForm]);

  const deleteEntry = (id) => {
    setEntries(prev => prev.filter(e => e.id !== id));
    showNotif("Entry deleted");
  };

  const income = parseFloat(monthlyIncome) || 0;
  const budgetUsed = income > 0 ? Math.min((thisMonthTotal / income) * 100, 100) : 0;
  const balanceColor = balance >= 0 ? "#10b981" : "#ef4444";

  return (
    <div style={{ fontFamily: "'DM Sans', 'Segoe UI', sans-serif", background: "var(--color-background-tertiary)", minHeight: "100vh", padding: "0 0 40px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=DM+Mono&display=swap');
        .tab-btn { padding: 8px 18px; border-radius: 20px; border: none; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.2s; background: transparent; color: var(--color-text-secondary); }
        .tab-btn.active { background: #6366f1; color: #fff; }
        .tab-btn:hover:not(.active) { background: var(--color-background-secondary); }
        .card { background: var(--color-background-primary); border-radius: 16px; border: 0.5px solid var(--color-border-tertiary); padding: 20px; }
        .metric-card { background: var(--color-background-secondary); border-radius: 12px; padding: 16px; }
        .inp { width: 100%; padding: 9px 12px; border-radius: 8px; border: 0.5px solid var(--color-border-secondary); font-size: 14px; background: var(--color-background-secondary); color: var(--color-text-primary); box-sizing: border-box; font-family: inherit; }
        .inp:focus { outline: none; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,0.15); }
        .btn-primary { background: #6366f1; color: white; border: none; border-radius: 10px; padding: 11px 24px; font-size: 14px; font-weight: 500; cursor: pointer; transition: all 0.2s; font-family: inherit; }
        .btn-primary:hover { background: #4f46e5; }
        .btn-sm { padding: 5px 12px; border-radius: 6px; border: 0.5px solid var(--color-border-secondary); background: transparent; color: var(--color-text-secondary); font-size: 12px; cursor: pointer; font-family: inherit; }
        .btn-sm:hover { background: var(--color-background-secondary); }
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

      {notification && <div className={`notif ${notification.type}`}>{notification.msg}</div>}

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
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-secondary)", marginBottom: 3 }}>Balance</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: balanceColor, fontFamily: "'DM Mono', monospace" }}>{fmt(balance)}</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 0 }}>
            {TABS.map(t => (
              <button key={t} className={`tab-btn ${activeTab === t ? "active" : ""}`} onClick={() => setActiveTab(t)}>{t}</button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 720, margin: "20px auto", padding: "0 16px" }}>

        {/* DASHBOARD */}
        {activeTab === "Dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* Setup Card */}
            <div className="card">
              <p className="section-title">Account Setup</p>
              <div className="expense-row">
                <div>
                  <label>Bank Balance (₹)</label>
                  {editingBalance ? (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input className="inp" type="number" value={tempBalance} onChange={e => setTempBalance(e.target.value)} placeholder="0" autoFocus />
                      <button className="btn-primary" style={{ padding: "9px 14px", whiteSpace: "nowrap" }} onClick={() => { setBankBalance(tempBalance); setEditingBalance(false); showNotif("Balance updated"); }}>Save</button>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: 1, padding: "9px 12px", borderRadius: 8, background: "var(--color-background-secondary)", fontSize: 14, fontWeight: 600, color: "var(--color-text-primary)", fontFamily: "'DM Mono', monospace" }}>{bankBalance ? fmt(bankBalance) : "Not set"}</div>
                      <button className="btn-sm" onClick={() => { setTempBalance(bankBalance); setEditingBalance(true); }}>Edit</button>
                    </div>
                  )}
                </div>
                <div>
                  <label>Monthly Income (₹)</label>
                  <div style={{ display: "flex", gap: 6 }}>
                    <select className="inp" style={{ width: "auto", minWidth: 90 }} value={incomeType} onChange={e => setIncomeType(e.target.value)}>
                      <option value="salary">Salary</option>
                      <option value="freelance">Freelance</option>
                      <option value="business">Business</option>
                      <option value="rental">Rental</option>
                      <option value="other">Other</option>
                    </select>
                    <input className="inp" type="number" value={monthlyIncome} onChange={e => setMonthlyIncome(e.target.value)} placeholder="0" />
                  </div>
                </div>
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
              {[
                { label: "Bank Balance", val: fmt(parseFloat(bankBalance) || 0), sub: "Current", color: "#6366f1" },
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
                    <Tooltip formatter={v => [fmt(v), "Spent"]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} cursor={{ fill: "rgba(99,102,241,0.08)" }} />
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
                    <Tooltip formatter={v => [fmt(v), ""]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} />
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
              <label>Entry Date</label>
              <input className="inp" type="date" value={expenseForm.date} onChange={e => setExpenseForm(p => ({ ...p, date: e.target.value }))} />
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Fixed Expenses</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(0, 4).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Variable Expenses</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(4, 8).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            {/* Subscription sub-name */}
            {parseFloat(expenseForm.subscriptions) > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label>📱 Subscription Name(s)</label>
                <input className="inp" type="text" placeholder="Netflix, Spotify, etc." value={expenseForm.subName} onChange={e => setExpenseForm(p => ({ ...p, subName: e.target.value }))} />
              </div>
            )}

            <p className="section-title" style={{ marginBottom: 14 }}>Savings & Wellbeing</p>
            <div className="expense-row" style={{ marginBottom: 16 }}>
              {EXPENSE_CATEGORIES.slice(8, 14).map(c => (
                <div key={c.key}>
                  <label>{c.icon} {c.label}</label>
                  <input className="inp" type="number" placeholder="0" value={expenseForm[c.key]} onChange={e => setExpenseForm(p => ({ ...p, [c.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <p className="section-title" style={{ marginBottom: 14 }}>Other</p>
            <div className="expense-row" style={{ marginBottom: 12 }}>
              <div>
                <label>📦 Other Expense Name</label>
                <input className="inp" type="text" placeholder="What did you spend on?" value={expenseForm.otherName} onChange={e => setExpenseForm(p => ({ ...p, otherName: e.target.value }))} />
              </div>
              <div>
                <label>📦 Other Amount (₹)</label>
                <input className="inp" type="number" placeholder="0" value={expenseForm.other} onChange={e => setExpenseForm(p => ({ ...p, other: e.target.value }))} />
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label>Note (optional)</label>
              <input className="inp" type="text" placeholder="Any notes for this entry..." value={expenseForm.note} onChange={e => setExpenseForm(p => ({ ...p, note: e.target.value }))} />
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
                    <Tooltip formatter={v => [fmt(v), "Spent"]} contentStyle={{ background: "var(--color-background-primary)", border: "0.5px solid var(--color-border-secondary)", borderRadius: 8, fontSize: 13 }} />
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

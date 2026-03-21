import { useEffect, useState } from "react";
import { apiFetch } from "~/api";
import StatCard from "~/components/StatCard";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface Stats {
  total_users: number;
  tokens_in_circulation: number;
  total_revenue_thb: number;
  active_users_7d: number;
  active_users_30d: number;
  translations_today: number;
}

interface DailySummary {
  date: string;
  credits: number;
  debits: number;
  count: number;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [chart, setChart] = useState<DailySummary[]>([]);

  useEffect(() => {
    apiFetch<Stats>("/admin/dashboard/stats").then(setStats);
    apiFetch<DailySummary[]>("/admin/transactions/summary?from=" + thirtyDaysAgo()).then(
      setChart
    );
  }, []);

  if (!stats) {
    return <p className="text-slate-400">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Dashboard</h2>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Total Users" value={stats.total_users} />
        <StatCard
          label="Tokens in Circulation"
          value={stats.tokens_in_circulation.toLocaleString()}
        />
        <StatCard
          label="Revenue"
          value={`${stats.total_revenue_thb.toLocaleString()} THB`}
        />
        <StatCard label="Active (7d)" value={stats.active_users_7d} />
        <StatCard label="Active (30d)" value={stats.active_users_30d} />
        <StatCard label="Translations Today" value={stats.translations_today} />
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="mb-4 text-sm font-medium text-slate-400">
          Daily Token Flow (Last 30 Days)
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              tickFormatter={(v: string) => v.slice(5)}
            />
            <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1e293b",
                border: "1px solid #334155",
                borderRadius: "8px",
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Legend />
            <Bar dataKey="credits" fill="#818cf8" name="Credits" />
            <Bar dataKey="debits" fill="#f87171" name="Debits" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

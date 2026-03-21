import { useEffect, useState } from "react";
import { apiFetch } from "~/api";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface UsageDay {
  date: string;
  translations: number;
}

export default function Activity() {
  const [data, setData] = useState<UsageDay[]>([]);

  useEffect(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    const from = d.toISOString().slice(0, 10);
    apiFetch<UsageDay[]>(`/admin/activity/usage?from=${from}`).then(setData);
  }, []);

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Activity</h2>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-5">
        <h3 className="mb-4 text-sm font-medium text-slate-400">
          Daily Translation Volume (Last 30 Days)
        </h3>
        <ResponsiveContainer width="100%" height={400}>
          <AreaChart data={data}>
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
            <Area
              type="monotone"
              dataKey="translations"
              stroke="#818cf8"
              fill="#818cf8"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

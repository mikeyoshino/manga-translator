import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "~/api";
import DataTable, { type Column } from "~/components/DataTable";

interface Transaction {
  id: string;
  user_id: string;
  email: string | null;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  channel: string | null;
  created_at: string;
}

const LIMIT = 50;

const columns: Column<Transaction>[] = [
  {
    key: "created_at",
    header: "Date",
    render: (r) => new Date(r.created_at).toLocaleString(),
  },
  { key: "email", header: "User" },
  {
    key: "type",
    header: "Type",
    render: (r) => (
      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
          r.type === "topup"
            ? "bg-green-900/40 text-green-300"
            : r.type === "refund"
              ? "bg-yellow-900/40 text-yellow-300"
              : r.type === "admin_credit"
                ? "bg-indigo-900/40 text-indigo-300"
                : "bg-red-900/40 text-red-300"
        }`}
      >
        {r.type}
      </span>
    ),
  },
  {
    key: "amount",
    header: "Amount",
    render: (r) => (
      <span className={`font-mono ${r.amount > 0 ? "text-green-400" : "text-red-400"}`}>
        {r.amount > 0 ? "+" : ""}
        {r.amount}
      </span>
    ),
  },
  { key: "balance_after", header: "Balance After", render: (r) => <span className="font-mono">{r.balance_after}</span> },
  { key: "reference", header: "Reference" },
  { key: "channel", header: "Channel" },
];

export default function Transactions() {
  const [data, setData] = useState<Transaction[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(offset),
    });
    if (typeFilter) params.set("type", typeFilter);
    apiFetch<{ transactions: Transaction[]; total: number }>(
      `/admin/transactions?${params}`
    ).then((d) => {
      setData(d.transactions);
      setTotal(d.total);
    });
  }, [offset, typeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Transactions</h2>
        <select
          value={typeFilter}
          onChange={(e) => {
            setOffset(0);
            setTypeFilter(e.target.value);
          }}
          className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All types</option>
          <option value="topup">Topup</option>
          <option value="translation">Translation</option>
          <option value="refund">Refund</option>
          <option value="admin_credit">Admin Credit</option>
        </select>
      </div>
      <DataTable
        columns={columns}
        data={data}
        total={total}
        limit={LIMIT}
        offset={offset}
        onPageChange={setOffset}
      />
    </div>
  );
}

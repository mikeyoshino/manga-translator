import { useEffect, useState, useCallback } from "react";
import { apiFetch } from "~/api";
import DataTable, { type Column } from "~/components/DataTable";

interface Payment {
  id: string;
  user_id: string;
  email: string | null;
  omise_charge_id: string;
  amount_satangs: number;
  tokens_to_credit: number;
  status: string;
  created_at: string;
}

const LIMIT = 50;

const columns: Column<Payment>[] = [
  {
    key: "created_at",
    header: "Date",
    render: (r) => new Date(r.created_at).toLocaleString(),
  },
  { key: "email", header: "User" },
  {
    key: "amount_satangs",
    header: "Amount (THB)",
    render: (r) => (
      <span className="font-mono">{(r.amount_satangs / 100).toLocaleString()}</span>
    ),
  },
  {
    key: "tokens_to_credit",
    header: "Tokens",
    render: (r) => <span className="font-mono">{r.tokens_to_credit}</span>,
  },
  {
    key: "status",
    header: "Status",
    render: (r) => (
      <span
        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
          r.status === "successful"
            ? "bg-green-900/40 text-green-300"
            : r.status === "pending"
              ? "bg-yellow-900/40 text-yellow-300"
              : "bg-red-900/40 text-red-300"
        }`}
      >
        {r.status}
      </span>
    ),
  },
  { key: "omise_charge_id", header: "Charge ID" },
];

export default function Payments() {
  const [data, setData] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(offset),
    });
    if (statusFilter) params.set("status", statusFilter);
    apiFetch<{ payments: Payment[]; total: number }>(
      `/admin/payments?${params}`
    ).then((d) => {
      setData(d.payments);
      setTotal(d.total);
    });
  }, [offset, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Payments</h2>
        <select
          value={statusFilter}
          onChange={(e) => {
            setOffset(0);
            setStatusFilter(e.target.value);
          }}
          className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white focus:border-indigo-500 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="successful">Successful</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
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

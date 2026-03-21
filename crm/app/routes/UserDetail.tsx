import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router";
import { apiFetch } from "~/api";
import DataTable, { type Column } from "~/components/DataTable";

interface UserProfile {
  id: string;
  email: string | null;
  display_name: string | null;
  token_balance: number;
  created_at: string;
  updated_at: string;
}

interface Transaction {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  reference: string | null;
  channel: string | null;
  created_at: string;
}

interface Project {
  id: string;
  name: string;
  image_count: number;
  updated_at: string;
  expires_at: string | null;
}

const LIMIT = 20;

const txnColumns: Column<Transaction>[] = [
  {
    key: "created_at",
    header: "Date",
    render: (r) => new Date(r.created_at).toLocaleString(),
  },
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

const projectColumns: Column<Project>[] = [
  { key: "name", header: "Name" },
  { key: "image_count", header: "Images" },
  {
    key: "updated_at",
    header: "Updated",
    render: (r) => new Date(r.updated_at).toLocaleDateString(),
  },
];

export default function UserDetail() {
  const { id } = useParams();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [tab, setTab] = useState<"transactions" | "projects">("transactions");
  const [txns, setTxns] = useState<Transaction[]>([]);
  const [txnTotal, setTxnTotal] = useState(0);
  const [txnOffset, setTxnOffset] = useState(0);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projTotal, setProjTotal] = useState(0);
  const [projOffset, setProjOffset] = useState(0);

  // Adjust balance modal
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<"credit" | "deduct">("credit");
  const [modalAmount, setModalAmount] = useState("");
  const [modalReason, setModalReason] = useState("");
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState("");

  useEffect(() => {
    if (id) {
      apiFetch<UserProfile>(`/admin/users/${id}`).then(setUser);
    }
  }, [id]);

  const loadTxns = useCallback(() => {
    if (!id) return;
    apiFetch<{ transactions: Transaction[]; total: number }>(
      `/admin/users/${id}/transactions?limit=${LIMIT}&offset=${txnOffset}`
    ).then((d) => {
      setTxns(d.transactions);
      setTxnTotal(d.total);
    });
  }, [id, txnOffset]);

  const loadProjects = useCallback(() => {
    if (!id) return;
    apiFetch<{ projects: Project[]; total: number }>(
      `/admin/users/${id}/projects?limit=${LIMIT}&offset=${projOffset}`
    ).then((d) => {
      setProjects(d.projects);
      setProjTotal(d.total);
    });
  }, [id, projOffset]);

  useEffect(() => {
    if (tab === "transactions") loadTxns();
    else loadProjects();
  }, [tab, loadTxns, loadProjects]);

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setModalLoading(true);
    setModalError("");
    try {
      const res = await apiFetch<{ new_balance: number }>(
        `/admin/users/${id}/${modalMode}`,
        {
          method: "POST",
          body: JSON.stringify({
            amount: Number(modalAmount),
            reason: modalReason,
          }),
        }
      );
      setUser((prev) => (prev ? { ...prev, token_balance: res.new_balance } : prev));
      setShowModal(false);
      setModalAmount("");
      setModalReason("");
      loadTxns();
    } catch (err) {
      setModalError(String(err));
    } finally {
      setModalLoading(false);
    }
  }

  if (!user) return <p className="text-slate-400">Loading user...</p>;

  return (
    <div className="space-y-6">
      {/* Profile card */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">{user.display_name || "No name"}</h2>
            <p className="text-sm text-slate-400">{user.email}</p>
            <p className="mt-2 text-sm text-slate-500">ID: {user.id}</p>
            <p className="text-sm text-slate-500">
              Joined: {new Date(user.created_at).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400">Token Balance</p>
            <p className="text-3xl font-bold text-indigo-400">
              {user.token_balance.toLocaleString()}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setModalMode("credit");
                  setShowModal(true);
                }}
                className="rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500"
              >
                + Credit
              </button>
              <button
                onClick={() => {
                  setModalMode("deduct");
                  setShowModal(true);
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500"
              >
                - Deduct
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-700">
        {(["transactions", "projects"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize ${
              tab === t
                ? "border-b-2 border-indigo-500 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "transactions" ? (
        <DataTable
          columns={txnColumns}
          data={txns}
          total={txnTotal}
          limit={LIMIT}
          offset={txnOffset}
          onPageChange={setTxnOffset}
        />
      ) : (
        <DataTable
          columns={projectColumns}
          data={projects}
          total={projTotal}
          limit={LIMIT}
          offset={projOffset}
          onPageChange={setProjOffset}
        />
      )}

      {/* Adjust balance modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <form
            onSubmit={handleAdjust}
            className="w-full max-w-sm space-y-4 rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <h3 className="text-lg font-bold capitalize">
              {modalMode} Tokens
            </h3>
            {modalError && (
              <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">
                {modalError}
              </p>
            )}
            <input
              type="number"
              min={1}
              placeholder="Amount"
              value={modalAmount}
              onChange={(e) => setModalAmount(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              required
            />
            <input
              type="text"
              placeholder="Reason"
              value={modalReason}
              onChange={(e) => setModalReason(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-700 px-4 py-2 text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
              required
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={modalLoading}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  modalMode === "credit"
                    ? "bg-green-600 hover:bg-green-500"
                    : "bg-red-600 hover:bg-red-500"
                }`}
              >
                {modalLoading ? "Processing..." : `${modalMode === "credit" ? "Credit" : "Deduct"} Tokens`}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

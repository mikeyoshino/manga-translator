import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router";
import { apiFetch } from "~/api";
import DataTable, { type Column } from "~/components/DataTable";

interface User {
  id: string;
  email: string | null;
  display_name: string | null;
  token_balance: number;
  created_at: string;
  updated_at: string;
}

const LIMIT = 50;

const columns: Column<User>[] = [
  { key: "email", header: "Email" },
  { key: "display_name", header: "Name" },
  {
    key: "token_balance",
    header: "Balance",
    render: (r) => <span className="font-mono">{r.token_balance}</span>,
  },
  {
    key: "created_at",
    header: "Created",
    render: (r) => new Date(r.created_at).toLocaleDateString(),
  },
  {
    key: "updated_at",
    header: "Last Active",
    render: (r) => new Date(r.updated_at).toLocaleDateString(),
  },
];

export default function Users() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const load = useCallback(() => {
    const params = new URLSearchParams({
      limit: String(LIMIT),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    apiFetch<{ users: User[]; total: number }>(
      `/admin/users?${params}`
    ).then((d) => {
      setUsers(d.users);
      setTotal(d.total);
    });
  }, [offset, search]);

  useEffect(() => {
    load();
  }, [load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setOffset(0);
    setSearch(searchInput);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Users</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            placeholder="Search by email..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="rounded-lg border border-slate-600 bg-slate-700 px-3 py-1.5 text-sm text-white placeholder-slate-400 focus:border-indigo-500 focus:outline-none"
          />
          <button
            type="submit"
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
          >
            Search
          </button>
        </form>
      </div>
      <DataTable
        columns={columns}
        data={users}
        total={total}
        limit={LIMIT}
        offset={offset}
        onPageChange={setOffset}
        onRowClick={(row) => navigate(`/users/${row.id}`)}
      />
    </div>
  );
}

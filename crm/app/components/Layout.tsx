import type { ReactNode } from "react";
import Sidebar from "./Sidebar";

interface Props {
  user: { email: string; display_name: string };
  children: ReactNode;
}

export default function Layout({ user, children }: Props) {
  return (
    <div className="flex h-screen bg-slate-900 text-white">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b border-slate-700 bg-slate-800 px-6">
          <h1 className="text-lg font-semibold text-indigo-400">WunPlae CRM</h1>
          <span className="text-sm text-slate-400">{user.display_name || user.email}</span>
        </header>
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}

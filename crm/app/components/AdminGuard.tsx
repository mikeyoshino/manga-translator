import type { ReactNode } from "react";

interface Props {
  user: { is_admin: boolean };
  children: ReactNode;
}

export default function AdminGuard({ user, children }: Props) {
  if (!user.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-red-400 text-xl">Admin access required</p>
      </div>
    );
  }
  return <>{children}</>;
}

import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "~/hooks/useAuth";
import AdminGuard from "~/components/AdminGuard";
import Layout from "~/components/Layout";
import Login from "~/routes/Login";
import Dashboard from "~/routes/Dashboard";
import Users from "~/routes/Users";
import UserDetail from "~/routes/UserDetail";
import Transactions from "~/routes/Transactions";
import Payments from "~/routes/Payments";
import Activity from "~/routes/Activity";

export default function App() {
  const { loading, user, error } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-lg">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-red-400">Error: {error}</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  if (!user.is_admin) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-400">Access Denied</h1>
          <p className="mt-2 text-slate-400">
            You don't have admin access. Logged in as {user.email}
          </p>
        </div>
      </div>
    );
  }

  return (
    <AdminGuard user={user}>
      <Layout user={user}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/users" element={<Users />} />
          <Route path="/users/:id" element={<UserDetail />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/payments" element={<Payments />} />
          <Route path="/activity" element={<Activity />} />
        </Routes>
      </Layout>
    </AdminGuard>
  );
}

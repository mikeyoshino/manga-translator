import { useAuth } from "@/context/AuthContext";
import { useNavigate } from "react-router";
import { useEffect } from "react";
import { useLocalePath } from "@/context/LocaleContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const lp = useLocalePath();

  useEffect(() => {
    if (!loading && !user) {
      navigate(lp("/login"));
    }
  }, [user, loading, navigate, lp]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}

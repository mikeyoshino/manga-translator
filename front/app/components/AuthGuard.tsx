import { useAuth } from "@/context/AuthContext";
import { useEffect } from "react";
import { useLocale } from "@/context/LocaleContext";

const SECURE_HOST = import.meta.env.VITE_SECURE_HOST || "";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const locale = useLocale();

  useEffect(() => {
    if (!loading && !user) {
      // Cross-subdomain redirect: send to secure.wunplae.com for login
      if (SECURE_HOST) {
        window.location.href = `${SECURE_HOST}/${locale}/login`;
      } else {
        // Fallback for local dev — same-origin redirect
        window.location.href = `/${locale}/login`;
      }
    }
  }, [user, loading, locale]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-100">
        <p className="text-gray-500">Redirecting to login...</p>
      </div>
    );
  }

  return <>{children}</>;
}

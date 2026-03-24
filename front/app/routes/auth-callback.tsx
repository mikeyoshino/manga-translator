import { useEffect, useState } from "react";
import { supabase } from "@/utils/supabase";
import { useLocale } from "@/context/LocaleContext";

export default function AuthCallbackPage() {
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const { data, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        const session = data.session;
        if (!session) {
          setError("No session found. Please try logging in again.");
          return;
        }

        // Send tokens to backend to set httpOnly cookies
        const res = await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          }),
        });

        if (!res.ok) {
          setError("Failed to create session. Please try again.");
          return;
        }

        window.location.href = `/${locale}/studio`;
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    };

    handleCallback();
  }, [locale]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm w-full max-w-md text-center">
          <h2 className="text-xl font-bold text-red-600 mb-4">Authentication Error</h2>
          <p className="text-slate-600 mb-6">{error}</p>
          <a
            href={`/${locale}/login`}
            className="text-indigo-600 hover:text-indigo-500 font-medium"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <p className="text-slate-600">Signing you in...</p>
      </div>
    </div>
  );
}

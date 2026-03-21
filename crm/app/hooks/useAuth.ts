import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "~/api";

interface AuthState {
  loading: boolean;
  user: { id: string; email: string; is_admin: boolean; token_balance: number; display_name: string } | null;
  error: string | null;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    loading: true,
    user: null,
    error: null,
  });

  useEffect(() => {
    apiFetch<AuthState["user"]>("/auth/me")
      .then((user) => setState({ loading: false, user, error: null }))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setState({ loading: false, user: null, error: null });
        } else {
          setState({ loading: false, user: null, error: String(err) });
        }
      });
  }, []);

  return state;
}

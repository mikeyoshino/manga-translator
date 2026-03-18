/**
 * Thin fetch wrapper that sends credentials (httpOnly cookies) with every request.
 * On 401 → dispatches `auth:expired` event so AuthContext can redirect to login.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
  });

  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  return response;
}

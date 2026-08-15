export type SessionUser = {
  username: string;
};

export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch("/api/auth/me", {
    credentials: "same-origin",
  });

  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Unable to check your session.");
  return response.json() as Promise<SessionUser>;
}

export async function login(username: string, password: string): Promise<SessionUser> {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (response.status === 401) throw new Error("Invalid username or password.");
  if (!response.ok) throw new Error("Unable to sign in right now.");
  return response.json() as Promise<SessionUser>;
}

export async function logout(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "same-origin",
  });

  if (!response.ok) throw new Error("Unable to sign out right now.");
}

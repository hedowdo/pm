"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { KanbanBoard } from "@/components/kanban-board";
import {
  getSession,
  login,
  logout,
  type SessionUser,
} from "@/lib/auth";

type AuthState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "signed-in"; user: SessionUser };

export function AuthGate() {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let active = true;

    getSession()
      .then((user) => {
        if (!active) return;
        setAuth(user ? { status: "signed-in", user } : { status: "signed-out" });
      })
      .catch((sessionError: unknown) => {
        if (!active) return;
        setError(messageFrom(sessionError));
        setAuth({ status: "signed-out" });
      });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin(username: string, password: string) {
    setError(null);
    setIsPending(true);
    try {
      const user = await login(username, password);
      setAuth({ status: "signed-in", user });
    } catch (loginError) {
      setError(messageFrom(loginError));
    } finally {
      setIsPending(false);
    }
  }

  async function handleLogout() {
    setError(null);
    setIsPending(true);
    try {
      await logout();
      setAuth({ status: "signed-out" });
    } catch (logoutError) {
      setError(messageFrom(logoutError));
    } finally {
      setIsPending(false);
    }
  }

  const handleUnauthorized = useCallback(() => {
    setError("Your session expired. Sign in again.");
    setAuth({ status: "signed-out" });
  }, []);

  if (auth.status === "loading") return <SessionLoading />;
  if (auth.status === "signed-out") {
    return <SignInForm error={error} isPending={isPending} onSubmit={handleLogin} />;
  }

  return (
    <KanbanBoard
      username={auth.user.username}
      isLoggingOut={isPending}
      logoutError={error}
      onLogout={handleLogout}
      onUnauthorized={handleUnauthorized}
    />
  );
}

function SessionLoading() {
  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10">
      <div className="w-full max-w-md rounded-[1.75rem] border border-[#032147]/10 bg-white/75 p-8 text-center shadow-[0_18px_45px_rgba(3,33,71,0.08)] backdrop-blur-sm">
        <span className="mx-auto mb-5 block h-3 w-3 animate-pulse rounded-full bg-[#ecad0a] shadow-[0_0_0_7px_rgba(236,173,10,0.16)]" />
        <p role="status" className="font-bold text-[#032147]">
          Checking your session...
        </p>
      </div>
    </main>
  );
}

function SignInForm({
  error,
  isPending,
  onSubmit,
}: {
  error: string | null;
  isPending: boolean;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onSubmit(username, password);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-10 sm:px-8">
      <section className="w-full max-w-md overflow-hidden rounded-[2rem] border border-[#032147]/10 bg-white/80 shadow-[0_24px_70px_rgba(3,33,71,0.12)] backdrop-blur-sm">
        <div className="h-2 bg-[#ecad0a]" />
        <div className="p-7 sm:p-10">
          <div className="mb-8">
            <p className="mb-4 text-[11px] font-bold tracking-[0.22em] text-[#753991]">
              PROJECT BOARD
            </p>
            <h1 className="editorial-title text-4xl font-bold tracking-[-0.05em] text-[#032147] sm:text-5xl">
              Kanban Studio
            </h1>
            <p className="mt-3 text-sm leading-6 text-[#888888]">
              Sign in to open your project board.
            </p>
          </div>

          <form onSubmit={submit}>
            <label htmlFor="username" className="block text-sm font-bold text-[#032147]">
              Username
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#032147]/16 bg-white px-4 py-3 outline-none transition focus:border-[#209dd7] focus:ring-3 focus:ring-[#209dd7]/15"
            />

            <label htmlFor="password" className="mt-5 block text-sm font-bold text-[#032147]">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-2 w-full rounded-xl border border-[#032147]/16 bg-white px-4 py-3 outline-none transition focus:border-[#209dd7] focus:ring-3 focus:ring-[#209dd7]/15"
            />

            {error && (
              <p role="alert" className="mt-4 text-sm font-semibold text-[#a53b2a]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="mt-7 w-full rounded-xl bg-[#753991] px-5 py-3.5 text-sm font-bold text-white shadow-[0_8px_17px_rgba(117,57,145,0.22)] transition hover:bg-[#63307c] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#753991] disabled:cursor-wait disabled:opacity-65"
            >
              {isPending ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}

function messageFrom(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

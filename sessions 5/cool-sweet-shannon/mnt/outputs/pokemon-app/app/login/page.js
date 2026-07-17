"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

function LoginForm() {
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const redirectTo = refCode ? `${origin}/?ref=${refCode}` : origin;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    setLoading(false);

    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <main className="min-h-screen flex flex-col justify-center px-6">
      <p className="text-3xl mb-1">⚡</p>
      <h1 className="text-2xl font-semibold mb-1 tracking-tight">Collector Challenges</h1>
      <p className="text-sm text-gray-500 mb-8">
        Sign in with your email to start earning points and giveaway entries.
      </p>

      {refCode && (
        <p className="text-xs text-brand-red mb-4 bg-red-50 rounded-lg px-3 py-2">
          You were invited by a friend — sign up to link your accounts.
        </p>
      )}

      {sent ? (
        <p className="text-sm text-gray-700 bg-gray-50 rounded-xl p-4">
          Check your email for a sign-in link.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-black"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-black text-white rounded-xl py-3 text-sm font-medium active:opacity-80"
          >
            {loading ? "Sending..." : "Send sign-in link"}
          </button>
          {error && <p className="text-sm text-brand-red">{error}</p>}
        </form>
      )}
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

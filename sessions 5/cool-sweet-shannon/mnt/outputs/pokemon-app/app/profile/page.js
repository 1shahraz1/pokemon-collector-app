"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { requireCompleteProfile } from "../../lib/authGuard";
import NavBar from "../../components/NavBar";

export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    const result = await requireCompleteProfile();
    if (result.redirect) {
      router.replace(`/${result.redirect}`);
      return;
    }
    setProfile(result.profile);
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-24 px-5 pt-8">
      <p className="text-xl font-semibold tracking-tight mb-5">Profile</p>

      <div className="border border-gray-100 rounded-2xl p-4 mb-4 flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-gray-100 overflow-hidden flex-shrink-0">
          {profile?.avatar_url && (
            <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div>
          <p className="text-sm font-semibold">@{profile?.username}</p>
          <p className="text-xs text-gray-400">{profile?.favorite_set}</p>
        </div>
      </div>

      <div className="border border-gray-100 rounded-2xl p-4 mb-4">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-gray-400">Points</p>
            <p className="text-lg font-semibold">{profile?.points || 0}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">Streak</p>
            <p className="text-lg font-semibold">{profile?.streak || 0} days</p>
          </div>
        </div>
      </div>

      <Link
        href="/onboarding?edit=1"
        className="block text-center border border-gray-200 rounded-xl py-3 text-sm font-medium mb-3"
      >
        Edit profile
      </Link>

      <button
        onClick={signOut}
        className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-500"
      >
        Sign out
      </button>

      <NavBar />
    </main>
  );
}

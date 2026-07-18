"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import { requireCompleteProfile } from "../../lib/authGuard";
import { getRank } from "../../lib/rank";
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

  const rank = getRank(profile?.points || 0);
  const memberSince = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : null;

  return (
    <main className="min-h-screen pb-24">
      <div className="bg-black px-5 pt-10 pb-8 rounded-b-[32px]">
        <div className="flex flex-col items-center text-center">
          <div className="w-24 h-24 rounded-full bg-gray-800 overflow-hidden flex-shrink-0 ring-4 ring-brand-red">
            {profile?.avatar_url && (
              <img src={profile.avatar_url} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <p className="text-white text-lg font-semibold mt-3">@{profile?.username}</p>
          {profile?.favorite_set && (
            <p className="text-gray-400 text-xs mt-0.5">{profile.favorite_set} enthusiast</p>
          )}

          <div className="mt-3 bg-brand-red text-white text-[11px] font-semibold uppercase tracking-wide px-3 py-1 rounded-full">
            {rank.label}
          </div>

          {rank.next && (
            <div className="w-full mt-4">
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand-red rounded-full"
                  style={{ width: `${rank.progress}%` }}
                />
              </div>
              <p className="text-gray-400 text-[11px] mt-1.5">
                {rank.pointsToNext} pts to {rank.next}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="px-5 -mt-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm grid grid-cols-2 divide-x divide-gray-100 overflow-hidden mb-4">
          <div className="p-4 text-center">
            <p className="text-2xl font-semibold">{profile?.points || 0}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wide">Points</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-2xl font-semibold text-brand-red">🔥 {profile?.streak || 0}</p>
            <p className="text-[11px] text-gray-400 mt-0.5 uppercase tracking-wide">Day streak</p>
          </div>
        </div>

        {memberSince && (
          <p className="text-center text-xs text-gray-400 mb-6">Collecting since {memberSince}</p>
        )}

        <Link
          href="/onboarding?edit=1"
          className="block text-center bg-black text-white rounded-xl py-3 text-sm font-medium mb-3"
        >
          Edit profile
        </Link>

        <button
          onClick={signOut}
          className="w-full border border-gray-200 rounded-xl py-3 text-sm text-gray-500"
        >
          Sign out
        </button>
      </div>

      <NavBar />
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { requireCompleteProfile } from "../../lib/authGuard";
import NavBar from "../../components/NavBar";

export default function GiveawayPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [giveaways, setGiveaways] = useState([]);
  const [entriesByGiveaway, setEntriesByGiveaway] = useState({});

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);

    const result = await requireCompleteProfile();
    if (result.redirect) {
      router.replace(`/${result.redirect}`);
      return;
    }

    const userId = result.session.user.id;

    const { data: giveawayRows } = await supabase
      .from("giveaways")
      .select("*")
      .order("draw_date", { ascending: true });

    setGiveaways(giveawayRows || []);

    const { data: entryRows } = await supabase
      .from("giveaway_entries")
      .select("giveaway_id, entries")
      .eq("user_id", userId);

    const map = {};
    (entryRows || []).forEach((e) => {
      map[e.giveaway_id] = e.entries;
    });
    setEntriesByGiveaway(map);

    setLoading(false);
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
      <p className="text-xl font-semibold tracking-tight mb-5">Giveaways</p>

      <div className="flex flex-col gap-3">
        {giveaways.length === 0 && (
          <p className="text-sm text-gray-400">No giveaways posted yet.</p>
        )}

        {giveaways.map((g) => (
          <div
            key={g.id}
            className={`rounded-2xl p-4 border ${
              g.active ? "border-black" : "border-gray-100"
            }`}
          >
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-semibold">{g.title}</p>
              <span
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${
                  g.active ? "bg-brand-red text-white" : "bg-gray-100 text-gray-400"
                }`}
              >
                {g.active ? "Open" : "Closed"}
              </span>
            </div>
            <p className="text-xs text-gray-500 mb-3">{g.prize_description}</p>
            <div className="flex justify-between text-xs text-gray-400">
              <span>Draws {g.draw_date}</span>
              <span className="font-medium text-black">{entriesByGiveaway[g.id] || 0} entries</span>
            </div>
            {g.winner_id && (
              <p className="text-xs text-gray-400 mt-2">Winner selected</p>
            )}
          </div>
        ))}
      </div>

      <NavBar />
    </main>
  );
}

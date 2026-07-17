"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabaseClient";
import { requireCompleteProfile } from "../lib/authGuard";
import { todayStr } from "../lib/dates";
import NavBar from "../components/NavBar";

const typeLabel = {
  upload_photo: "Photo",
  quiz: "Quiz",
  log_card: "Collection",
  custom_action: "Challenge",
};

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [challenges, setChallenges] = useState([]);
  const [questionsByChallenge, setQuestionsByChallenge] = useState({});
  const [completedIds, setCompletedIds] = useState(new Set());
  const [giveaway, setGiveaway] = useState(null);
  const [entries, setEntries] = useState(0);
  const [referralCount, setReferralCount] = useState(0);
  const [busyId, setBusyId] = useState(null);
  const [quizAnswers, setQuizAnswers] = useState({});
  const [quizResult, setQuizResult] = useState({});
  const [copyLabel, setCopyLabel] = useState("Copy link");

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);

    const result = await requireCompleteProfile();
    if (result.redirect === "login") {
      router.replace("/login");
      return;
    }
    if (result.redirect === "onboarding") {
      const ref = searchParams.get("ref");
      router.replace(ref ? `/onboarding?ref=${ref}` : "/onboarding");
      return;
    }

    setSession(result.session);
    setProfile(result.profile);

    const userId = result.session.user.id;
    const today = todayStr();

    const [{ data: challengeRows }, { data: giveawayRows }, { data: referralRows }] =
      await Promise.all([
        supabase.from("challenges").select("*").eq("active_date", today).order("points"),
        supabase
          .from("giveaways")
          .select("*")
          .eq("active", true)
          .order("draw_date", { ascending: true })
          .limit(1),
        supabase
          .from("referrals")
          .select("id")
          .eq("referrer_id", userId)
          .eq("credited", true),
      ]);

    setChallenges(challengeRows || []);
    setReferralCount((referralRows || []).length);

    const activeGiveaway = giveawayRows && giveawayRows[0] ? giveawayRows[0] : null;
    setGiveaway(activeGiveaway);

    const quizChallengeIds = (challengeRows || [])
      .filter((c) => c.type === "quiz")
      .map((c) => c.id);

    if (quizChallengeIds.length > 0) {
      const { data: questionRows } = await supabase
        .from("quiz_questions_public")
        .select("*")
        .in("challenge_id", quizChallengeIds)
        .order("order_index");

      const grouped = {};
      (questionRows || []).forEach((q) => {
        grouped[q.challenge_id] = grouped[q.challenge_id] || [];
        grouped[q.challenge_id].push(q);
      });
      setQuestionsByChallenge(grouped);
    }

    const challengeIds = (challengeRows || []).map((c) => c.id);
    if (challengeIds.length > 0) {
      const { data: completionRows } = await supabase
        .from("completions")
        .select("challenge_id")
        .eq("user_id", userId)
        .in("challenge_id", challengeIds);
      setCompletedIds(new Set((completionRows || []).map((c) => c.challenge_id)));
    } else {
      setCompletedIds(new Set());
    }

    if (activeGiveaway) {
      const { data: entryRow } = await supabase
        .from("giveaway_entries")
        .select("entries")
        .eq("user_id", userId)
        .eq("giveaway_id", activeGiveaway.id)
        .maybeSingle();
      setEntries(entryRow ? entryRow.entries : 0);
    }

    setLoading(false);
  }

  async function refreshPointsAndEntries() {
    const { data: freshProfile } = await supabase
      .from("profiles")
      .select("points, streak")
      .eq("id", session.user.id)
      .single();
    if (freshProfile) {
      setProfile((p) => ({ ...p, points: freshProfile.points, streak: freshProfile.streak }));
    }
    if (giveaway) {
      const { data: entryRow } = await supabase
        .from("giveaway_entries")
        .select("entries")
        .eq("user_id", session.user.id)
        .eq("giveaway_id", giveaway.id)
        .maybeSingle();
      setEntries(entryRow ? entryRow.entries : 0);
    }
  }

  async function completeSimple(challenge) {
    setBusyId(challenge.id);
    const { data: awarded } = await supabase.rpc("complete_challenge", {
      p_challenge_id: challenge.id,
      p_image_url: null,
    });
    if (awarded) {
      setCompletedIds((prev) => new Set(prev).add(challenge.id));
      await refreshPointsAndEntries();
    }
    setBusyId(null);
  }

  async function uploadPhoto(challenge, file) {
    setBusyId(challenge.id);

    const path = `${session.user.id}/${challenge.id}-${Date.now()}.${file.name.split(".").pop()}`;
    const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);

    if (uploadError) {
      setBusyId(null);
      return;
    }

    const { data } = supabase.storage.from("uploads").getPublicUrl(path);

    const { data: awarded } = await supabase.rpc("complete_challenge", {
      p_challenge_id: challenge.id,
      p_image_url: data.publicUrl,
    });

    if (awarded) {
      setCompletedIds((prev) => new Set(prev).add(challenge.id));
      await refreshPointsAndEntries();
    }
    setBusyId(null);
  }

  function setAnswer(challengeId, questionId, index) {
    setQuizAnswers((prev) => ({
      ...prev,
      [challengeId]: { ...(prev[challengeId] || {}), [questionId]: index },
    }));
  }

  async function submitQuiz(challenge) {
    setBusyId(challenge.id);
    const answers = quizAnswers[challenge.id] || {};

    const { data } = await supabase.rpc("submit_quiz", {
      p_challenge_id: challenge.id,
      p_answers: answers,
    });

    setQuizResult((prev) => ({ ...prev, [challenge.id]: data }));

    if (data?.awarded) {
      setCompletedIds((prev) => new Set(prev).add(challenge.id));
      await refreshPointsAndEntries();
    }
    setBusyId(null);
  }

  async function copyReferralLink() {
    const link = `${window.location.origin}/login?ref=${profile.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopyLabel("Copied");
      setTimeout(() => setCopyLabel("Copy link"), 1500);
    } catch {
      // clipboard not available, nothing more we can do here
    }
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
      <div className="flex justify-between items-center mb-5">
        <div>
          <p className="text-xs text-gray-400">Welcome back</p>
          <p className="text-base font-semibold tracking-tight">@{profile?.username}</p>
        </div>
        <div className="flex gap-2">
          <div className="rounded-xl px-3 py-1.5 border border-gray-100">
            <p className="text-xs font-medium text-brand-red">🔥 {profile?.streak || 0}</p>
          </div>
          <div className="bg-black rounded-xl px-3 py-1.5">
            <p className="text-xs font-medium text-white">★ {profile?.points || 0}</p>
          </div>
        </div>
      </div>

      <div className="bg-black rounded-2xl p-4 mb-4">
        <div className="flex justify-between items-center mb-1">
          <p className="text-sm font-medium text-white">Invite friends</p>
          <p className="text-xs text-gray-300">{referralCount} joined</p>
        </div>
        <p className="text-xs text-gray-300 mb-3">
          Your friends earn entries too, and your invite is worth the most entries of any challenge.
        </p>
        <button
          onClick={copyReferralLink}
          className="w-full bg-brand-red text-white rounded-xl py-2 text-xs font-semibold"
        >
          {copyLabel}
        </button>
      </div>

      {giveaway && (
        <div className="border border-gray-100 rounded-2xl p-4 mb-5">
          <div className="flex justify-between items-center mb-1">
            <p className="text-sm font-semibold">{giveaway.title}</p>
            <p className="text-xs text-gray-400">draws {giveaway.draw_date}</p>
          </div>
          <p className="text-xs text-gray-500">You have {entries} entries</p>
        </div>
      )}

      <p className="text-sm font-semibold text-gray-900 mb-3">Today's challenges</p>

      <div className="flex flex-col gap-3">
        {challenges.length === 0 && (
          <p className="text-sm text-gray-400">
            No challenges posted for today yet. Check back soon.
          </p>
        )}

        {challenges.map((c) => {
          const done = completedIds.has(c.id);
          const busy = busyId === c.id;

          return (
            <div key={c.id} className="border border-gray-100 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-1">
                <div className="flex-1 pr-3">
                  <p className="text-[10px] uppercase tracking-wide text-brand-red font-semibold mb-0.5">
                    {typeLabel[c.type] || "Challenge"}
                  </p>
                  <p className="text-sm font-medium">{c.title}</p>
                  {c.description && (
                    <p className="text-xs text-gray-500 mt-0.5">{c.description}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    +{c.points} pts &middot; +{c.entries} {c.entries === 1 ? "entry" : "entries"}
                  </p>
                </div>

                {(c.type === "log_card" || c.type === "custom_action") && (
                  <button
                    disabled={done || busy}
                    onClick={() => completeSimple(c)}
                    className={`text-xs px-3 py-1.5 rounded-xl font-medium whitespace-nowrap ${
                      done ? "bg-gray-100 text-gray-400" : "bg-black text-white"
                    }`}
                  >
                    {done ? "Done" : busy ? "..." : "Complete"}
                  </button>
                )}
              </div>

              {c.type === "upload_photo" && !done && (
                <label className="mt-2 block text-center border border-dashed border-gray-200 rounded-xl py-3 text-xs font-medium text-brand-red cursor-pointer">
                  {busy ? "Uploading..." : "Upload photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={busy}
                    onChange={(e) => e.target.files?.[0] && uploadPhoto(c, e.target.files[0])}
                  />
                </label>
              )}
              {c.type === "upload_photo" && done && (
                <p className="text-xs text-gray-400 mt-2">Uploaded — pts and entries added.</p>
              )}

              {c.type === "quiz" && !done && (
                <div className="mt-3 flex flex-col gap-3">
                  {(questionsByChallenge[c.id] || []).map((q) => (
                    <div key={q.id}>
                      <p className="text-xs font-medium mb-1.5">{q.question}</p>
                      <div className="flex flex-col gap-1.5">
                        {q.options.map((opt, i) => {
                          const selected = quizAnswers[c.id]?.[q.id] === i;
                          return (
                            <button
                              type="button"
                              key={i}
                              onClick={() => setAnswer(c.id, q.id, i)}
                              className={`text-left text-xs px-3 py-2 rounded-lg border ${
                                selected
                                  ? "border-black bg-black text-white"
                                  : "border-gray-200 text-gray-700"
                              }`}
                            >
                              {opt}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <button
                    disabled={busy}
                    onClick={() => submitQuiz(c)}
                    className="bg-brand-red text-white rounded-xl py-2 text-xs font-semibold mt-1"
                  >
                    {busy ? "Checking..." : "Submit answers"}
                  </button>
                  {quizResult[c.id] && !quizResult[c.id].passed && (
                    <p className="text-xs text-brand-red">
                      {quizResult[c.id].correct}/{quizResult[c.id].total} correct — not quite enough, try again tomorrow.
                    </p>
                  )}
                </div>
              )}
              {c.type === "quiz" && done && (
                <p className="text-xs text-gray-400 mt-2">Passed — pts and entries added.</p>
              )}
            </div>
          );
        })}
      </div>

      <NavBar />
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense fallback={null}>
      <HomeInner />
    </Suspense>
  );
}

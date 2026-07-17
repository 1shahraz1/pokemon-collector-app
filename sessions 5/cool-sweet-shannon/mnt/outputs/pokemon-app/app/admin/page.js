"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";
import { todayStr } from "../../lib/dates";

const inputClass =
  "border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-brand-black";

export default function AdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [challenges, setChallenges] = useState([]);
  const [giveaways, setGiveaways] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  const [cTitle, setCTitle] = useState("");
  const [cDescription, setCDescription] = useState("");
  const [cType, setCType] = useState("custom_action");
  const [cPoints, setCPoints] = useState(10);
  const [cEntries, setCEntries] = useState(1);
  const [cDate, setCDate] = useState(todayStr());

  const [gTitle, setGTitle] = useState("");
  const [gPrize, setGPrize] = useState("");
  const [gDrawDate, setGDrawDate] = useState("");

  const [quizDrafts, setQuizDrafts] = useState({});
  const [pickingId, setPickingId] = useState(null);

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAccess() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", session.user.id)
      .single();

    if (!profile?.is_admin) {
      setLoading(false);
      setAllowed(false);
      return;
    }

    setAllowed(true);
    await loadData();
    setLoading(false);
  }

  async function loadData() {
    const { data: challengeRows } = await supabase
      .from("challenges")
      .select("*, quiz_questions(*)")
      .order("active_date", { ascending: false });
    setChallenges(challengeRows || []);

    const { data: giveawayRows } = await supabase
      .from("giveaways")
      .select("*")
      .order("draw_date", { ascending: false });
    setGiveaways(giveawayRows || []);

    const { data: completionRows } = await supabase
      .from("completions")
      .select("*, profiles(username), challenges(title, type)")
      .not("image_url", "is", null)
      .order("completed_at", { ascending: false });
    setSubmissions(completionRows || []);
  }

  async function addChallenge(e) {
    e.preventDefault();
    await supabase.from("challenges").insert({
      title: cTitle,
      description: cDescription,
      type: cType,
      points: Number(cPoints),
      entries: Number(cEntries),
      active_date: cDate,
    });
    setCTitle("");
    setCDescription("");
    setCType("custom_action");
    setCPoints(10);
    setCEntries(1);
    loadData();
  }

  async function addGiveaway(e) {
    e.preventDefault();
    await supabase.from("giveaways").insert({
      title: gTitle,
      prize_description: gPrize,
      draw_date: gDrawDate,
      active: true,
    });
    setGTitle("");
    setGPrize("");
    setGDrawDate("");
    loadData();
  }

  async function pickWinner(giveaway) {
    setPickingId(giveaway.id);

    const { data: entryRows } = await supabase
      .from("giveaway_entries")
      .select("user_id, entries")
      .eq("giveaway_id", giveaway.id);

    const pool = [];
    (entryRows || []).forEach((row) => {
      for (let i = 0; i < row.entries; i++) pool.push(row.user_id);
    });

    if (pool.length === 0) {
      alert("No entries yet for this giveaway.");
      setPickingId(null);
      return;
    }

    const winnerId = pool[Math.floor(Math.random() * pool.length)];

    await supabase
      .from("giveaways")
      .update({ winner_id: winnerId, active: false })
      .eq("id", giveaway.id);

    setPickingId(null);
    loadData();
  }

  function updateDraft(challengeId, field, value) {
    setQuizDrafts((prev) => ({
      ...prev,
      [challengeId]: { ...(prev[challengeId] || { question: "", options: ["", "", "", ""], correct: 0 }), [field]: value },
    }));
  }

  function updateDraftOption(challengeId, index, value) {
    setQuizDrafts((prev) => {
      const current = prev[challengeId] || { question: "", options: ["", "", "", ""], correct: 0 };
      const options = [...current.options];
      options[index] = value;
      return { ...prev, [challengeId]: { ...current, options } };
    });
  }

  async function addQuestion(challengeId) {
    const draft = quizDrafts[challengeId];
    if (!draft?.question || draft.options.some((o) => !o)) return;

    await supabase.from("quiz_questions").insert({
      challenge_id: challengeId,
      question: draft.question,
      options: draft.options,
      correct_index: Number(draft.correct),
    });

    setQuizDrafts((prev) => ({ ...prev, [challengeId]: { question: "", options: ["", "", "", ""], correct: 0 } }));
    loadData();
  }

  async function toggleFlag(submission) {
    await supabase
      .from("completions")
      .update({ flagged: !submission.flagged })
      .eq("id", submission.id);
    loadData();
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
  }

  if (!allowed) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="text-sm text-gray-500">
          This page is for admins only. Set is_admin to true on your profile row in
          Supabase to get access.
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-20 px-5 pt-8">
      <p className="text-xl font-semibold tracking-tight mb-6">Admin</p>

      <p className="text-sm font-semibold mb-2">Add a challenge</p>
      <form onSubmit={addChallenge} className="flex flex-col gap-2 mb-8 border border-gray-100 rounded-2xl p-4">
        <input
          required
          placeholder="Title"
          value={cTitle}
          onChange={(e) => setCTitle(e.target.value)}
          className={inputClass}
        />
        <textarea
          placeholder="Description (optional)"
          value={cDescription}
          onChange={(e) => setCDescription(e.target.value)}
          className={inputClass}
        />
        <select value={cType} onChange={(e) => setCType(e.target.value)} className={inputClass}>
          <option value="custom_action">Custom action (simple complete button)</option>
          <option value="log_card">Log a card</option>
          <option value="upload_photo">Upload a photo</option>
          <option value="quiz">Quiz</option>
        </select>
        <div className="flex gap-2">
          <input
            type="number"
            min="0"
            value={cPoints}
            onChange={(e) => setCPoints(e.target.value)}
            className={inputClass + " w-1/3"}
          />
          <input
            type="number"
            min="0"
            value={cEntries}
            onChange={(e) => setCEntries(e.target.value)}
            className={inputClass + " w-1/3"}
          />
          <input
            type="date"
            value={cDate}
            onChange={(e) => setCDate(e.target.value)}
            className={inputClass + " w-1/3"}
          />
        </div>
        <button className="bg-black text-white rounded-xl py-2.5 text-sm font-medium">
          Add challenge
        </button>
      </form>

      <p className="text-sm font-semibold mb-2">Add a giveaway</p>
      <form onSubmit={addGiveaway} className="flex flex-col gap-2 mb-8 border border-gray-100 rounded-2xl p-4">
        <input
          required
          placeholder="Title"
          value={gTitle}
          onChange={(e) => setGTitle(e.target.value)}
          className={inputClass}
        />
        <input
          placeholder="Prize description"
          value={gPrize}
          onChange={(e) => setGPrize(e.target.value)}
          className={inputClass}
        />
        <input
          type="date"
          required
          value={gDrawDate}
          onChange={(e) => setGDrawDate(e.target.value)}
          className={inputClass}
        />
        <button className="bg-black text-white rounded-xl py-2.5 text-sm font-medium">
          Add giveaway
        </button>
      </form>

      <p className="text-sm font-semibold mb-2">Giveaways</p>
      <div className="flex flex-col gap-2 mb-8">
        {giveaways.map((g) => (
          <div key={g.id} className="border border-gray-100 rounded-2xl p-3">
            <div className="flex justify-between items-center mb-1">
              <p className="text-sm font-medium">{g.title}</p>
              <span className="text-xs text-gray-400">{g.active ? "Open" : "Closed"}</span>
            </div>
            <p className="text-xs text-gray-400 mb-2">Draws {g.draw_date}</p>
            {g.winner_id ? (
              <p className="text-xs text-gray-500">Winner id: {g.winner_id}</p>
            ) : (
              g.active && (
                <button
                  onClick={() => pickWinner(g)}
                  disabled={pickingId === g.id}
                  className="text-xs bg-brand-red text-white px-3 py-1.5 rounded-lg font-medium"
                >
                  {pickingId === g.id ? "Picking..." : "Pick winner"}
                </button>
              )
            )}
          </div>
        ))}
      </div>

      <p className="text-sm font-semibold mb-2">Photo submissions</p>
      <div className="flex flex-col gap-2 mb-8">
        {submissions.length === 0 && <p className="text-xs text-gray-400">None yet.</p>}
        {submissions.map((s) => (
          <div key={s.id} className="border border-gray-100 rounded-2xl p-3 flex gap-3">
            <img src={s.image_url} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
            <div className="flex-1">
              <p className="text-xs font-medium">@{s.profiles?.username}</p>
              <p className="text-xs text-gray-400">{s.challenges?.title}</p>
              <button
                onClick={() => toggleFlag(s)}
                className={`text-[11px] mt-1 px-2 py-1 rounded-md font-medium ${
                  s.flagged ? "bg-brand-red text-white" : "border border-gray-200 text-gray-500"
                }`}
              >
                {s.flagged ? "Flagged" : "Flag as suspicious"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="text-sm font-semibold mb-2">Challenges</p>
      <div className="flex flex-col gap-3">
        {challenges.map((c) => (
          <div key={c.id} className="border border-gray-100 rounded-2xl p-3">
            <p className="text-sm">{c.title}</p>
            <p className="text-xs text-gray-400 mb-2">
              {c.active_date} &middot; {c.type} &middot; +{c.points} pts &middot; +{c.entries} entries
            </p>

            {c.type === "quiz" && (
              <div className="mt-2 border-t border-gray-100 pt-2">
                {(c.quiz_questions || []).map((q) => (
                  <p key={q.id} className="text-xs text-gray-500 mb-1">
                    {q.question}
                  </p>
                ))}
                <div className="flex flex-col gap-1 mt-2">
                  <input
                    placeholder="New question"
                    value={quizDrafts[c.id]?.question || ""}
                    onChange={(e) => updateDraft(c.id, "question", e.target.value)}
                    className={inputClass + " text-xs"}
                  />
                  {[0, 1, 2, 3].map((i) => (
                    <input
                      key={i}
                      placeholder={`Option ${i + 1}`}
                      value={quizDrafts[c.id]?.options?.[i] || ""}
                      onChange={(e) => updateDraftOption(c.id, i, e.target.value)}
                      className={inputClass + " text-xs"}
                    />
                  ))}
                  <select
                    value={quizDrafts[c.id]?.correct ?? 0}
                    onChange={(e) => updateDraft(c.id, "correct", e.target.value)}
                    className={inputClass + " text-xs"}
                  >
                    <option value={0}>Correct: option 1</option>
                    <option value={1}>Correct: option 2</option>
                    <option value={2}>Correct: option 3</option>
                    <option value={3}>Correct: option 4</option>
                  </select>
                  <button
                    onClick={() => addQuestion(c.id)}
                    className="border border-gray-200 rounded-lg py-1.5 text-xs font-medium"
                  >
                    Add question
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}

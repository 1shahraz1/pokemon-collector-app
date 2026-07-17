"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabaseClient";

const inputClass =
  "border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-brand-black w-full";
const labelClass = "text-xs font-medium text-gray-500 mb-1 block";

function OnboardingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const refCode = searchParams.get("ref");
  const isEditing = searchParams.get("edit") === "1";

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [favoriteSet, setFavoriteSet] = useState("");
  const [line1, setLine1] = useState("");
  const [line2, setLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("US");

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace("/login");
      return;
    }

    setSession(session);

    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    if (profile?.profile_completed && !isEditing) {
      router.replace("/");
      return;
    }

    if (profile) {
      setFullName(profile.full_name || "");
      setUsername(profile.username || "");
      setFavoriteSet(profile.favorite_set || "");
      setLine1(profile.shipping_line1 || "");
      setLine2(profile.shipping_line2 || "");
      setCity(profile.shipping_city || "");
      setState(profile.shipping_state || "");
      setZip(profile.shipping_zip || "");
      setCountry(profile.shipping_country || "US");
      setAvatarPreview(profile.avatar_url || null);
    }

    setLoading(false);
  }

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  const canSubmit =
    fullName && username && favoriteSet && line1 && city && state && zip && (avatarFile || avatarPreview);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!canSubmit) {
      setError("Every field, including a profile picture, is required.");
      return;
    }

    setSaving(true);

    let avatarUrl = avatarPreview;

    if (avatarFile) {
      const path = `${session.user.id}/avatar-${Date.now()}.${avatarFile.name.split(".").pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });

      if (uploadError) {
        setError(uploadError.message);
        setSaving(false);
        return;
      }

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      avatarUrl = data.publicUrl;
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({
        full_name: fullName,
        username: username.trim().toLowerCase(),
        favorite_set: favoriteSet,
        shipping_line1: line1,
        shipping_line2: line2,
        shipping_city: city,
        shipping_state: state,
        shipping_zip: zip,
        shipping_country: country,
        avatar_url: avatarUrl,
        profile_completed: true,
      })
      .eq("id", session.user.id);

    if (updateError) {
      setSaving(false);
      if (updateError.code === "23505") {
        setError("That username is already taken. Try another.");
      } else {
        setError(updateError.message);
      }
      return;
    }

    if (refCode) {
      await supabase.rpc("apply_referral", { p_ref_code: refCode });
    }

    router.replace("/");
  }

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="text-sm text-gray-400">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-6 pt-10 pb-16">
      <h1 className="text-2xl font-semibold tracking-tight mb-1">
        {isEditing ? "Edit your profile" : "Complete your profile"}
      </h1>
      <p className="text-sm text-gray-500 mb-8">
        {isEditing
          ? "Update any of your details below."
          : "One quick step before you can start today's challenges."}
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center flex-shrink-0">
            {avatarPreview ? (
              <img src={avatarPreview} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xs text-gray-400">Photo</span>
            )}
          </div>
          <label className="text-sm font-medium text-brand-red cursor-pointer">
            {avatarPreview ? "Change photo" : "Add profile picture"}
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </label>
        </div>

        <div>
          <label className={labelClass}>Full name</label>
          <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <p className="text-[11px] text-gray-400 mt-1">Private — never shown publicly.</p>
        </div>

        <div>
          <label className={labelClass}>Username handle</label>
          <input
            className={inputClass}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="e.g. charizard_ash"
          />
          <p className="text-[11px] text-gray-400 mt-1">Public — shown instead of your name.</p>
        </div>

        <div>
          <label className={labelClass}>Favorite Pokemon set</label>
          <input
            className={inputClass}
            value={favoriteSet}
            onChange={(e) => setFavoriteSet(e.target.value)}
            placeholder="e.g. Base Set, Evolving Skies"
          />
        </div>

        <div>
          <label className={labelClass}>Shipping address</label>
          <p className="text-[11px] text-gray-400 mb-2">
            So we can mail you a prize if you win a giveaway.
          </p>
          <div className="flex flex-col gap-2">
            <input
              className={inputClass}
              placeholder="Address line 1"
              value={line1}
              onChange={(e) => setLine1(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Address line 2 (optional)"
              value={line2}
              onChange={(e) => setLine2(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="City"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
              <input
                className={inputClass + " w-24"}
                placeholder="State"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="ZIP"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
              <input
                className={inputClass}
                placeholder="Country"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
          </div>
        </div>

        {error && <p className="text-sm text-brand-red">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="bg-black text-white rounded-xl py-3 text-sm font-medium active:opacity-80 mt-2"
        >
          {saving ? "Saving..." : isEditing ? "Save changes" : "Start collecting"}
        </button>
      </form>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={null}>
      <OnboardingForm />
    </Suspense>
  );
}

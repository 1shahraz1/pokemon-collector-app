import { supabase } from "./supabaseClient";

// Every real page (except /login and /onboarding) calls this on load.
// It returns where the user needs to go: "login" if there's no session,
// "onboarding" if they haven't finished their profile yet, or null if
// they're good to see the page -- along with the session and profile
// so the page doesn't have to fetch them again.
export async function requireCompleteProfile() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return { redirect: "login", session: null, profile: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", session.user.id)
    .single();

  if (!profile || !profile.profile_completed) {
    return { redirect: "onboarding", session, profile };
  }

  return { redirect: null, session, profile };
}

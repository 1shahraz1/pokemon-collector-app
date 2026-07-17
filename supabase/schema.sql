-- Run this once in your Supabase project's SQL editor.
-- Dashboard -> SQL editor -> New query -> paste all of this -> Run.
-- Safe to run on a brand new project. This creates every table, storage
-- bucket, security rule, and helper function the app needs.

create extension if not exists "pgcrypto";

-- =========================================================
-- PROFILES
-- One row per signed-up user. Created automatically on signup
-- (see handle_new_user below). Most fields start empty until the
-- person finishes the required profile form in the app.
-- =========================================================
create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  full_name text,
  username text unique,
  avatar_url text,
  favorite_set text,
  shipping_line1 text,
  shipping_line2 text,
  shipping_city text,
  shipping_state text,
  shipping_zip text,
  shipping_country text default 'US',
  profile_completed boolean default false,
  points int default 0,
  streak int default 0,
  last_completed_date date,
  is_admin boolean default false,
  referral_code text unique,
  referred_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Challenges an admin posts. type drives which UI the app shows:
-- 'custom_action', 'log_card', 'upload_photo', 'quiz', or the
-- always-on referral tile (which isn't stored here at all, see below).
create table if not exists challenges (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  type text not null default 'custom_action'
    check (type in ('custom_action', 'log_card', 'upload_photo', 'quiz')),
  points int default 10,
  entries int default 1,
  active_date date not null,
  created_at timestamptz default now()
);

-- Questions belonging to a 'quiz' challenge. correct_index is never sent
-- to the browser directly -- grading happens inside submit_quiz() below
-- so people can't peek at the answer key in the network tab.
create table if not exists quiz_questions (
  id uuid default gen_random_uuid() primary key,
  challenge_id uuid references challenges(id) on delete cascade,
  question text not null,
  options jsonb not null,
  correct_index int not null,
  order_index int default 0,
  created_at timestamptz default now()
);

-- One row per user per challenge they've completed (ever). image_url is
-- filled in for 'upload_photo' challenges so admins can review the photo.
create table if not exists completions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  challenge_id uuid references challenges(id) on delete cascade,
  image_url text,
  flagged boolean default false,
  completed_at timestamptz default now(),
  unique(user_id, challenge_id)
);

-- A giveaway/drawing an admin runs.
create table if not exists giveaways (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  prize_description text,
  draw_date date not null,
  active boolean default true,
  winner_id uuid references profiles(id),
  created_at timestamptz default now()
);

-- How many entries each user has for a given giveaway.
create table if not exists giveaway_entries (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references profiles(id) on delete cascade,
  giveaway_id uuid references giveaways(id) on delete cascade,
  entries int default 0,
  unique(user_id, giveaway_id)
);

-- One row per successfully-referred signup. credited=false means the
-- referrer hit their daily cap that day -- recorded for your visibility,
-- but not paid out, so referral farming doesn't scale.
create table if not exists referrals (
  id uuid default gen_random_uuid() primary key,
  referrer_id uuid references profiles(id) on delete cascade,
  referred_id uuid references profiles(id) on delete cascade unique,
  credited boolean default false,
  giveaway_id uuid references giveaways(id),
  created_at timestamptz default now()
);

-- =========================================================
-- SIGNUP TRIGGER
-- Creates the profile row and a unique referral code the moment
-- someone signs up, before they've filled in anything else.
-- =========================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, referral_code)
  values (new.id, new.email, substr(md5(random()::text || new.id::text), 1, 8));
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- =========================================================
-- CHALLENGE / REFERRAL LOGIC (server-side only)
-- All points, streaks, and entries are written here, never directly
-- from the browser -- see the column grants at the bottom of this file
-- for why that matters.
-- =========================================================

-- Shared logic for awarding a completed challenge. Not callable directly
-- by the app (no grant on it) -- only complete_challenge() and
-- submit_quiz() below call it, always scoped to the calling user.
create or replace function award_challenge(p_user_id uuid, p_challenge_id uuid, p_image_url text default null)
returns boolean as $$
declare
  v_points int;
  v_entries int;
  v_today date := current_date;
  v_yesterday date := current_date - 1;
  v_last_date date;
  v_streak int;
  v_giveaway_id uuid;
begin
  if exists (select 1 from completions where user_id = p_user_id and challenge_id = p_challenge_id) then
    return false;
  end if;

  select points, entries into v_points, v_entries from challenges where id = p_challenge_id;
  if v_points is null then
    return false;
  end if;

  insert into completions (user_id, challenge_id, image_url)
    values (p_user_id, p_challenge_id, p_image_url);

  select last_completed_date, streak into v_last_date, v_streak from profiles where id = p_user_id;

  if v_last_date = v_today then
    -- already active today, streak unchanged
  elsif v_last_date = v_yesterday then
    v_streak := coalesce(v_streak, 0) + 1;
  else
    v_streak := 1;
  end if;

  update profiles set points = points + v_points, streak = v_streak, last_completed_date = v_today
    where id = p_user_id;

  select id into v_giveaway_id from giveaways where active = true order by draw_date asc limit 1;

  if v_giveaway_id is not null then
    insert into giveaway_entries (user_id, giveaway_id, entries)
      values (p_user_id, v_giveaway_id, v_entries)
      on conflict (user_id, giveaway_id) do update set entries = giveaway_entries.entries + v_entries;
  end if;

  return true;
end;
$$ language plpgsql security definer;

-- Call this from the app for custom_action, log_card, and upload_photo
-- challenges. p_image_url is only used for upload_photo.
create or replace function complete_challenge(p_challenge_id uuid, p_image_url text default null)
returns boolean as $$
begin
  return award_challenge(auth.uid(), p_challenge_id, p_image_url);
end;
$$ language plpgsql security definer;

grant execute on function complete_challenge(uuid, text) to authenticated;

-- Call this for quiz challenges. p_answers is a JSON object like
-- {"<question-id>": 2, "<question-id>": 0} mapping each question to the
-- selected option index. Grading happens here so the answer key never
-- reaches the browser.
create or replace function submit_quiz(p_challenge_id uuid, p_answers jsonb)
returns jsonb as $$
declare
  v_total int;
  v_correct int := 0;
  v_q record;
  v_given int;
  v_pass boolean;
  v_awarded boolean := false;
begin
  select count(*) into v_total from quiz_questions where challenge_id = p_challenge_id;
  if v_total = 0 then
    return jsonb_build_object('error', 'no questions configured');
  end if;

  for v_q in select id, correct_index from quiz_questions where challenge_id = p_challenge_id loop
    v_given := (p_answers ->> v_q.id::text)::int;
    if v_given = v_q.correct_index then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_pass := (v_correct::float / v_total::float) >= 0.6;

  if v_pass then
    v_awarded := award_challenge(auth.uid(), p_challenge_id, null);
  end if;

  return jsonb_build_object('correct', v_correct, 'total', v_total, 'passed', v_pass, 'awarded', v_awarded);
end;
$$ language plpgsql security definer;

grant execute on function submit_quiz(uuid, jsonb) to authenticated;

-- Call this once, right after a referred user finishes their profile,
-- passing the ?ref= code from their signup link. Handles: no self-referrals,
-- one-time only, and a daily cap per referrer so farming doesn't pay out.
create or replace function apply_referral(p_ref_code text)
returns jsonb as $$
declare
  v_referrer_id uuid;
  v_self uuid := auth.uid();
  v_already boolean;
  v_cap int := 5;
  v_today_count int;
  v_giveaway_id uuid;
  v_ref_points int := 30;
  v_ref_entries int := 5;
begin
  select id into v_referrer_id from profiles where referral_code = p_ref_code;

  if v_referrer_id is null or v_referrer_id = v_self then
    return jsonb_build_object('applied', false, 'reason', 'invalid code');
  end if;

  select (referred_by is not null) into v_already from profiles where id = v_self;
  if v_already then
    return jsonb_build_object('applied', false, 'reason', 'already referred');
  end if;

  update profiles set referred_by = v_referrer_id where id = v_self;

  select count(*) into v_today_count from referrals
    where referrer_id = v_referrer_id and created_at::date = current_date and credited = true;

  select id into v_giveaway_id from giveaways where active = true order by draw_date asc limit 1;

  if v_today_count < v_cap then
    insert into referrals (referrer_id, referred_id, credited, giveaway_id)
      values (v_referrer_id, v_self, true, v_giveaway_id);

    update profiles set points = points + v_ref_points where id = v_referrer_id;

    if v_giveaway_id is not null then
      insert into giveaway_entries (user_id, giveaway_id, entries)
        values (v_referrer_id, v_giveaway_id, v_ref_entries)
        on conflict (user_id, giveaway_id) do update set entries = giveaway_entries.entries + v_ref_entries;
    end if;

    return jsonb_build_object('applied', true, 'credited', true);
  else
    insert into referrals (referrer_id, referred_id, credited, giveaway_id)
      values (v_referrer_id, v_self, false, v_giveaway_id);

    return jsonb_build_object('applied', true, 'credited', false, 'reason', 'referrer daily cap reached');
  end if;
end;
$$ language plpgsql security definer;

grant execute on function apply_referral(text) to authenticated;

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
alter table profiles enable row level security;
alter table challenges enable row level security;
alter table quiz_questions enable row level security;
alter table completions enable row level security;
alter table giveaways enable row level security;
alter table giveaway_entries enable row level security;
alter table referrals enable row level security;

create policy "profiles readable by owner" on profiles
  for select using (auth.uid() = id);
create policy "profiles readable by admins" on profiles
  for select using (exists (select 1 from profiles p where p.id = auth.uid() and p.is_admin = true));
create policy "profiles updatable by owner" on profiles
  for update using (auth.uid() = id);

create policy "challenges readable by signed in users" on challenges
  for select using (auth.role() = 'authenticated');
create policy "admins can insert challenges" on challenges
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- quiz_questions has NO select policy for regular users on purpose --
-- the app reads questions through quiz_questions_public below instead,
-- which omits correct_index.
create policy "admins can read quiz questions" on quiz_questions
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
create policy "admins can insert quiz questions" on quiz_questions
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "completions readable by owner" on completions
  for select using (auth.uid() = user_id);
create policy "completions readable by admins" on completions
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
create policy "admins can flag completions" on completions
  for update using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "giveaways readable by signed in users" on giveaways
  for select using (auth.role() = 'authenticated');
create policy "admins can insert giveaways" on giveaways
  for insert with check (exists (select 1 from profiles where id = auth.uid() and is_admin = true));
create policy "admins can update giveaways" on giveaways
  for update using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

create policy "entries readable by owner" on giveaway_entries
  for select using (auth.uid() = user_id);

create policy "referrals readable by involved users" on referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);

-- A limited public view of profiles (username + avatar only) for
-- future features like a leaderboard, without exposing shipping
-- addresses, full names, or emails to other users.
create or replace view public_profiles as
  select id, username, avatar_url, points, streak from profiles;
grant select on public_profiles to authenticated;

-- Quiz questions without the answer key, safe for the app to query.
create or replace view quiz_questions_public as
  select id, challenge_id, question, options, order_index from quiz_questions;
grant select on quiz_questions_public to authenticated;

-- =========================================================
-- COLUMN-LEVEL LOCKDOWN
-- Even though the update policy above lets a user update their own
-- profile row, we only grant UPDATE on the columns that are safe for
-- them to change directly. Points, streak, is_admin, and referred_by
-- can only change through the functions above -- never by an update
-- call from the browser.
-- =========================================================
revoke update on profiles from authenticated;
grant update (
  full_name, username, avatar_url, favorite_set,
  shipping_line1, shipping_line2, shipping_city, shipping_state, shipping_zip, shipping_country,
  profile_completed
) on profiles to authenticated;

-- =========================================================
-- STORAGE (profile pictures + challenge photo uploads)
-- =========================================================
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('uploads', 'uploads', true)
  on conflict (id) do nothing;

create policy "avatar images are publicly readable" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "users can upload their own avatar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users can replace their own avatar" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "challenge photos are publicly readable" on storage.objects
  for select using (bucket_id = 'uploads');
create policy "users can upload their own challenge photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================
-- SEED DATA so the app isn't empty on first load. Edit or delete
-- these from /admin any time.
-- =========================================================
insert into challenges (title, description, type, points, entries, active_date)
values
  ('Show off a rare pull', 'Upload a photo of a rare card, hit, or box from any set you opened recently.', 'upload_photo', 25, 3, current_date),
  ('Log 1 card from your collection', 'Add a card you own to your tracked collection.', 'log_card', 10, 1, current_date),
  ('Pokemon trivia', 'Answer today''s trivia questions.', 'quiz', 20, 2, current_date);

insert into quiz_questions (challenge_id, question, options, correct_index, order_index)
select id, 'Which type is super effective against Water?', '["Fire", "Grass", "Electric", "Normal"]'::jsonb, 1, 0
from challenges where title = 'Pokemon trivia' and active_date = current_date;

insert into quiz_questions (challenge_id, question, options, correct_index, order_index)
select id, 'What rarity symbol is a card with no symbol usually considered?', '["Common", "Rare", "Holo rare", "Secret rare"]'::jsonb, 0, 1
from challenges where title = 'Pokemon trivia' and active_date = current_date;

insert into giveaways (title, prize_description, draw_date, active)
values ('Weekly booster pack draw', 'One winner gets a booster pack, picked at random weighted by entries.', current_date + interval '7 days', true);

-- VaultLearn — optional Row Level Security for Supabase deployments (defense in depth).
--
-- The app talks to Postgres through Prisma using the `postgres` role, which bypasses RLS. These policies
-- protect the tables from Supabase's auto-generated REST/GraphQL APIs (anon / authenticated roles) in case a
-- client ever queries them directly. Run AFTER `prisma migrate deploy`. Safe to re-run.

do $$
declare t text;
begin
  foreach t in array array[
    'users', 'user_api_keys', 'user_ai_personas', 'subjects', 'topics', 'exam_uploads',
    'mistake_cards', 'card_attempt_logs', 'adaptive_tags', 'mistake_card_tags',
    'tag_suggestion_feedback', 'exam_prep_sessions', 'ai_synthesized_problems',
    'ai_synthesized_problem_sources'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- users: a user can see/update only their own row.
drop policy if exists users_self on public.users;
create policy users_self on public.users
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- user_api_keys: NO client access at all (ciphertext is server-only). RLS enabled + no policy = deny.

-- Tables with a user_id column: owner-only.
do $$
declare t text;
begin
  foreach t in array array[
    'user_ai_personas', 'subjects', 'topics', 'exam_uploads', 'mistake_cards',
    'card_attempt_logs', 'adaptive_tags', 'tag_suggestion_feedback', 'exam_prep_sessions',
    'ai_synthesized_problems'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;

-- Join tables: ownership via the parent row.
drop policy if exists mistake_card_tags_owner on public.mistake_card_tags;
create policy mistake_card_tags_owner on public.mistake_card_tags
  for all to authenticated
  using (exists (select 1 from public.mistake_cards c where c.id = card_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.mistake_cards c where c.id = card_id and c.user_id = auth.uid()));

drop policy if exists ai_synthesized_problem_sources_owner on public.ai_synthesized_problem_sources;
create policy ai_synthesized_problem_sources_owner on public.ai_synthesized_problem_sources
  for all to authenticated
  using (exists (select 1 from public.ai_synthesized_problems p where p.id = problem_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.ai_synthesized_problems p where p.id = problem_id and p.user_id = auth.uid()));

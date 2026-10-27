-- Run once in your Supabase SQL editor. Only authenticated owners can access a library.
create table if not exists public.study_libraries (
 user_id uuid primary key references auth.users(id) on delete cascade,
 data jsonb not null,
 version bigint not null default 1 check (version > 0)
);
alter table public.study_libraries enable row level security;
revoke all on public.study_libraries from anon;
grant select, insert, update, delete on public.study_libraries to authenticated;
create policy "Read own library" on public.study_libraries for select to authenticated using ((select auth.uid()) = user_id);
create policy "Create own library" on public.study_libraries for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Update own library" on public.study_libraries for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Delete own library" on public.study_libraries for delete to authenticated using ((select auth.uid()) = user_id);

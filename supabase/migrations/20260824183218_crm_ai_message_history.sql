create table public.crm_ai_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(trim(content)) between 1 and 12000),
  sources jsonb not null default '[]'::jsonb check (jsonb_typeof(sources) = 'array'),
  period text,
  created_at timestamptz not null default now()
);

create index crm_ai_messages_user_created_idx
  on public.crm_ai_messages (user_id, created_at asc);

alter table public.crm_ai_messages enable row level security;

create policy crm_ai_messages_select_own
  on public.crm_ai_messages
  for select to authenticated
  using ((select auth.uid()) = user_id and (select public.is_manager()));

create policy crm_ai_messages_insert_own
  on public.crm_ai_messages
  for insert to authenticated
  with check ((select auth.uid()) = user_id and (select public.is_manager()));

create policy crm_ai_messages_delete_own
  on public.crm_ai_messages
  for delete to authenticated
  using ((select auth.uid()) = user_id and (select public.is_manager()));

revoke all on public.crm_ai_messages from anon;
grant select, insert, delete on public.crm_ai_messages to authenticated;

comment on table public.crm_ai_messages is
  'Privat og varig samtalehistorikk for Spør CRM. Hver bruker kan bare lese og skrive sin egen historikk.';

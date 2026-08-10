alter table public.appointments
  add column reminder_id uuid
    references public.reminders (id) on delete cascade;

create unique index appointments_reminder_idx
  on public.appointments (reminder_id)
  where reminder_id is not null;

comment on column public.appointments.reminder_id is
  'Kobler en kalenderhendelse til oppgaven den synkroniseres med.';

create or replace function public.sync_reminder_calendar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'reminders' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    insert into public.appointments (
      reminder_id,
      agent_id,
      customer_id,
      title,
      type,
      status,
      starts_at,
      notes
    ) values (
      new.id,
      new.agent_id,
      new.customer_id,
      new.title,
      'annet',
      case when new.done then 'gjennomfort' else 'planlagt' end,
      new.due_at,
      new.note
    )
    on conflict (reminder_id) where reminder_id is not null
    do update set
      agent_id = excluded.agent_id,
      customer_id = excluded.customer_id,
      title = excluded.title,
      status = excluded.status,
      starts_at = excluded.starts_at,
      notes = excluded.notes;

    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.reminder_id is not null then
      delete from public.reminders where id = old.reminder_id;
    end if;
    return old;
  end if;

  if new.reminder_id is not null then
    update public.reminders
    set
      agent_id = new.agent_id,
      customer_id = new.customer_id,
      title = new.title,
      note = new.notes,
      due_at = new.starts_at,
      done = new.status in ('gjennomfort', 'avlyst', 'no_show'),
      done_at = case
        when new.status in ('gjennomfort', 'avlyst', 'no_show')
          then coalesce(done_at, now())
        else null
      end
    where id = new.reminder_id;
  end if;

  return new;
end;
$$;

revoke execute on function public.sync_reminder_calendar() from public, anon, authenticated;

create trigger reminders_sync_calendar
  after insert or update or delete on public.reminders
  for each row execute function public.sync_reminder_calendar();

create trigger appointments_sync_reminder
  after update or delete on public.appointments
  for each row execute function public.sync_reminder_calendar();

insert into public.appointments (
  reminder_id,
  agent_id,
  customer_id,
  title,
  type,
  status,
  starts_at,
  notes
)
select
  id,
  agent_id,
  customer_id,
  title,
  'annet'::public.appointment_type,
  case
    when done then 'gjennomfort'::public.appointment_status
    else 'planlagt'::public.appointment_status
  end,
  due_at,
  note
from public.reminders
on conflict (reminder_id) where reminder_id is not null do nothing;

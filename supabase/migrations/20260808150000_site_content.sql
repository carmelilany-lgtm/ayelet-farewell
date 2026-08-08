-- Site content (editable from admin) as a single JSON row
create table public.site_content (
  id text primary key default 'main',
  content jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.site_content enable row level security;
revoke all on table public.site_content from anon, authenticated;
grant all on table public.site_content to service_role;

insert into public.site_content (id, content)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

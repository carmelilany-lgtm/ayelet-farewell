-- Preserve Google Sheets / import row order in admin list
alter table public.rsvps
  add column if not exists sheet_order integer;

create index if not exists rsvps_sheet_order_idx
  on public.rsvps (sheet_order asc nulls last);

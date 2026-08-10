create table if not exists public.help_manuals (
  id text primary key check (id ~ '^[a-z0-9-]+$'),
  title_en text not null,
  title_zh text not null,
  summary_en text not null,
  summary_zh text not null,
  storage_path text not null unique,
  page_count smallint not null check (page_count > 0),
  sort_order smallint not null default 0,
  is_published boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.help_manuals enable row level security;

revoke all on table public.help_manuals from anon, authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'help-manuals',
  'help-manuals',
  false,
  10485760,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

insert into public.help_manuals (
  id,
  title_en,
  title_zh,
  summary_en,
  summary_zh,
  storage_path,
  page_count,
  sort_order
)
values
  (
    'quick-start',
    'Quick start',
    '快速开始',
    'Location, map controls and the first quiet route.',
    '定位、地图控件和第一次安静路线规划。',
    'quietmel-quick-start.pdf',
    2,
    10
  ),
  (
    'map-data',
    'Map and crowd data',
    '地图与人流数据',
    'Live layers, sensor readings and the six-hour forecast.',
    '实时图层、传感器读数和未来六小时预测。',
    'quietmel-map-and-crowd-data.pdf',
    2,
    20
  ),
  (
    'routes',
    'Routes and quiet places',
    '路线与安静地点',
    'Route alternatives, navigation and nearby quiet places.',
    '路线备选、导航和附近安静地点。',
    'quietmel-routes-and-quiet-places.pdf',
    2,
    30
  )
on conflict (id) do update set
  title_en = excluded.title_en,
  title_zh = excluded.title_zh,
  summary_en = excluded.summary_en,
  summary_zh = excluded.summary_zh,
  storage_path = excluded.storage_path,
  page_count = excluded.page_count,
  sort_order = excluded.sort_order,
  is_published = true,
  updated_at = now();


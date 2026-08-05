-- Stable catalogue for City of Melbourne pedestrian sensor locations.
-- Live minute-by-minute counts remain in the upstream API and are not stored here.
create table if not exists public.pedestrian_sensors (
  location_id bigint primary key,
  sensor_name text,
  sensor_description text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  status text not null default 'A',
  google_place_id text,
  source_name text not null default 'City of Melbourne Pedestrian Counting System',
  source_url text not null default 'https://data.melbourne.vic.gov.au/explore/dataset/pedestrian-counting-system-sensor-locations/',
  source_synced_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists pedestrian_sensors_coordinates_idx
  on public.pedestrian_sensors (latitude, longitude);

create index if not exists pedestrian_sensors_status_idx
  on public.pedestrian_sensors (status);

comment on table public.pedestrian_sensors is
  'Stable City of Melbourne pedestrian sensor locations. Google Places content is not persisted; only an optional Google place ID may be stored.';

alter table public.pedestrian_sensors enable row level security;

revoke all on table public.pedestrian_sensors from anon, authenticated;
grant select, insert, update, delete on table public.pedestrian_sensors to service_role;

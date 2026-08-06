-- Stores only user UI preferences. Google Places content remains owned by Google
-- and is requested live in the browser; it is never copied into this table.
create table if not exists public.user_map_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quick_place_categories text[] not null
    default array['parks', 'libraries', 'cafes']::text[],
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint user_map_preferences_has_category
    check (cardinality(quick_place_categories) between 1 and 11),
  constraint user_map_preferences_categories_are_valid
    check (
      quick_place_categories <@ array[
        'parks',
        'libraries',
        'cafes',
        'gardens',
        'museums',
        'art-galleries',
        'bookshops',
        'community-centres',
        'picnic-areas',
        'visitor-centres',
        'places-of-worship'
      ]::text[]
    )
);

comment on table public.user_map_preferences is
  'Per-user QuietMel map UI preferences. Does not store Google Places content.';

alter table public.user_map_preferences enable row level security;

revoke all on table public.user_map_preferences from anon, authenticated;
grant select, insert, update, delete on table public.user_map_preferences to service_role;


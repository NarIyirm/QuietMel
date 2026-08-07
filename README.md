# QuietMel

QuietMel is a responsive map experience designed to help neurodivergent people discover places and routes with a low-stimulation interface. The map opens with the live crowd layer and can switch to real Google Places category searches with walking routes.

## Google Maps setup

1. Enable billing for the Google Cloud project.
2. Enable these APIs in **APIs & Services > Library**:
   - **Maps JavaScript API**, for the base map and markers.
   - **Places API**, for the Maps JavaScript Places library.
   - **Places API (New)**, for Nearby Search (New) and place details.
   - **Routes API**, for walking routes and route polylines.
3. Open `.env.local` and add your key:

```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID` is suitable for local development. A Map ID controls map styling and features; it is not the ID of Melbourne University Library or another location. For production, create a JavaScript Map ID in Google Cloud and replace this value.

Nearby places are requested live from Google Places when a scene button is
selected. Walking routes are requested only after the user selects a place and
chooses **Show walking route**. Google place content is held in the current page
session and is never written to Supabase.

Restrict the browser key under **APIs & Services > Credentials**:

- Application restriction: **Websites (HTTP referrers)**.
- Local referrers: `http://localhost:5173/*` and `http://127.0.0.1:5173/*`.
- Production referrers: the exact deployed domains, for example
  `https://your-domain.example/*`.
- API restrictions: **Maps JavaScript API**, **Places API**, **Places API
  (New)**, and **Routes API** only.

Never commit `.env.local`. `DEMO_MAP_ID` is suitable for local development. For
production, create a JavaScript Map ID under **Google Maps Platform > Map
Management** and replace it.

## Local development

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite frontend on port 5173 and the Express API on
port 3000. Vite proxies `/api` requests to Express.

### Supabase connection

1. Copy `server/.env.example` to `server/.env`.
2. Add the project URL, publishable key, and server-only secret key from the
   Supabase project settings. Never put the secret key in a `VITE_` variable.
3. Run `supabase/migrations/20260805000100_health_check.sql` in the Supabase
   SQL editor, followed by
   `supabase/migrations/20260805000200_pedestrian_sensors.sql`.
4. Start the project and open `http://localhost:3000/api/health/database`.

A successful database connection returns `"database": "connected"`.

Scene button selections are stored only in versioned browser local storage.
They are restored on the same device after a refresh. Google Places results
are never persisted.

### Live pedestrian activity

`GET /api/crowd/live` combines the City of Melbourne's past-hour pedestrian
counts with its active sensor locations. Express keeps the latest reading for
each sensor, classifies it using the project's low/medium/high thresholds, and
caches the snapshot for 60 seconds before the React map requests it.

This live-data phase does not persist minute-by-minute pedestrian readings in
Supabase. The source data is provided by the City of Melbourne under CC BY 4.0.

`GET /api/crowd/sensors` exposes the stable sensor-location catalogue. The
service synchronises City of Melbourne sensor names, descriptions and
coordinates into `public.pedestrian_sensors`, then falls back to that table if
the upstream location feed is unavailable. Minute-by-minute counts are not
stored. Google Places content is also not persisted; the table only reserves
an optional `google_place_id`, which Google permits applications to retain.

### Six-hour crowd forecast

The Forecast button requests `GET /api/crowd/forecast` once and animates 25
heatmap frames from the current Melbourne time through the next six hours at
15-minute intervals. A predicted value of zero means no pedestrians and is not
rendered as heat. Sensors 28, 65 and 78 are excluded from the model.

The forecast profile is based on the latest two-year rolling training window.
To store the trained profile in Supabase:

1. Run `supabase/migrations/20260808000100_crowd_hourly_profiles.sql` in the
   Supabase SQL editor.
2. Run `npm run forecast:import` to validate and upload
   `model/output/crowd_hourly_profiles.csv`.

The Express forecast service reads profiles exclusively from the Supabase
table. The versioned CSV is only a training/import artifact and is never used
as a runtime fallback.

## Commands

- `npm run dev`: start the Vite development server
- `npm run dev:client`: start only the Vite frontend
- `npm run dev:server`: start only the Express API
- `npm run check:server`: type-check the Express API
- `npm run forecast:import`: validate and upload the trained forecast profile
- `npm run build`: type-check and create a production build
- `npm run lint`: check code quality
- `npm run preview`: preview the production build

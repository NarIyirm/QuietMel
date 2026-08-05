# QuietMel

QuietMel is a responsive map experience designed to help neurodivergent people discover calmer places and routes. The current MVP focuses on a low-stimulation visual framework and a Google Maps base map; search and route planning are placeholders for later development.

## Google Maps setup

1. Enable **Maps JavaScript API** and **Places API (New)** in your Google Cloud project, and make sure billing is enabled.
2. Open `.env.local` and add your key:

```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID` is suitable for local development. A Map ID controls map styling and features; it is not the ID of Melbourne University Library or another location. For production, create a JavaScript Map ID in Google Cloud and replace this value.

Sensor place details are requested from Google Places only when a user opens a
sensor card. Results are held in the current page session to avoid duplicate
requests and are never written to Supabase. Restrict the browser API key to the
local and deployed website origins, and restrict its API access to Maps
JavaScript API and Places API (New).

Restrict the API key to **Websites (HTTP referrers)** and restrict its API access to **Maps JavaScript API** before deployment. Never commit `.env.local`.

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

### Email authentication and Turnstile

The API provides:

- `POST /api/auth/register`
- `POST /api/auth/login`

Both accept JSON with `email`, `password`, and an optional `turnstileToken`.
To enforce CAPTCHA, create a Cloudflare Turnstile widget, enable Turnstile in
Supabase under Authentication > Bot and Abuse Protection, and set
`AUTH_CAPTCHA_REQUIRED=true`. Supabase validates the single-use token; do not
also submit the same token to Cloudflare Siteverify from Express.

Keep CAPTCHA disabled until the frontend widget is connected. Cloudflare's
test site key in `.env.example` is for local development only.

### Live pedestrian activity

`GET /api/crowd/live` combines the City of Melbourne's past-hour pedestrian
counts with its active sensor locations. Express keeps the latest reading for
each sensor, classifies it using the project's low/medium/high thresholds, and
caches the snapshot for 60 seconds before the React map requests it.

This first live-data phase does not persist pedestrian readings in Supabase.
Historical storage should be added when trend analysis or forecasting is
implemented. The source data is provided by the City of Melbourne under
CC BY 4.0.

`GET /api/crowd/sensors` exposes the stable sensor-location catalogue. The
service synchronises City of Melbourne sensor names, descriptions and
coordinates into `public.pedestrian_sensors`, then falls back to that table if
the upstream location feed is unavailable. Minute-by-minute counts are not
stored. Google Places content is also not persisted; the table only reserves
an optional `google_place_id`, which Google permits applications to retain.

## Commands

- `npm run dev`: start the Vite development server
- `npm run dev:client`: start only the Vite frontend
- `npm run dev:server`: start only the Express API
- `npm run check:server`: type-check the Express API
- `npm run build`: type-check and create a production build
- `npm run lint`: check code quality
- `npm run preview`: preview the production build

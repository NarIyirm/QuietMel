# QuietMel

QuietMel is a responsive map experience designed to help neurodivergent people discover calmer places and routes. The current MVP focuses on a low-stimulation visual framework and a Google Maps base map; search and route planning are placeholders for later development.

## Google Maps setup

1. Enable **Maps JavaScript API** in your Google Cloud project and make sure billing is enabled.
2. Open `.env.local` and add your key:

```env
VITE_GOOGLE_MAPS_API_KEY=your_api_key_here
VITE_GOOGLE_MAPS_MAP_ID=DEMO_MAP_ID
```

`DEMO_MAP_ID` is suitable for local development. A Map ID controls map styling and features; it is not the ID of Melbourne University Library or another location. For production, create a JavaScript Map ID in Google Cloud and replace this value.

Restrict the API key to **Websites (HTTP referrers)** and restrict its API access to **Maps JavaScript API** before deployment. Never commit `.env.local`.

## Local development

```bash
npm install
npm run dev
```

After changing `.env.local`, restart the development server.

## Commands

- `npm run dev`: start the Vite development server
- `npm run build`: type-check and create a production build
- `npm run lint`: check code quality
- `npm run preview`: preview the production build

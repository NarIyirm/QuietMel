import app from '../server/app.js'

// Catch every /api/* request and forward it to the Express application.
// Vercel's api/index.ts entry only matches /api itself.
export default app

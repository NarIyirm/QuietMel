import cors from 'cors'
import express from 'express'

import { env } from './config/env.js'
import { crowdRouter } from './routes/crowd.js'
import { healthRouter } from './routes/health.js'
import { helpRouter } from './routes/help.js'
import { routesRouter } from './routes/routes.js'

const app = express()
const allowedOrigins = new Set(env.clientOrigins)
if (env.nodeEnv !== 'production') {
  allowedOrigins.add('http://localhost:5173')
  allowedOrigins.add('http://127.0.0.1:5173')
}

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)
app.use(express.json({ limit: '500kb' }))

app.use('/api/health', healthRouter)
app.use('/api/crowd', crowdRouter)
app.use('/api/help', helpRouter)
app.use('/api/routes', routesRouter)

app.use((_request, response) => {
  response.status(404).json({ error: 'not_found' })
})

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  void _next
  response.status(500).json({
    error: 'request_failed',
    message: error instanceof Error ? error.message : 'The request could not be processed.',
  })
})

export default app

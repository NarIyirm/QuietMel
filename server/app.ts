import cors from 'cors'
import express from 'express'

import { env } from './config/env.js'
import { crowdRouter } from './routes/crowd.js'
import { healthRouter } from './routes/health.js'

const app = express()

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(
  cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || env.clientOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin is not allowed by CORS'))
    },
  }),
)
app.use(express.json({ limit: '100kb' }))

app.use('/api/health', healthRouter)
app.use('/api/crowd', crowdRouter)

app.use((_request, response) => {
  response.status(404).json({ error: 'not_found' })
})

export default app

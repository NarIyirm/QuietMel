import { Router } from 'express'
import { z } from 'zod'

import { ForecastUnavailableError } from '../services/forecast.js'
import { selectQuietRoute } from '../services/quietRoute.js'

const coordinateSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
})

const requestSchema = z.object({
  departureTime: z.iso.datetime(),
  candidates: z.array(z.object({
    id: z.string().min(1).max(40),
    durationMinutes: z.number().positive().max(1_440),
    distanceMeters: z.number().positive().max(1_000_000),
    path: z.array(coordinateSchema).min(2).max(600),
  })).min(1).max(4),
})

export const routesRouter = Router()

routesRouter.post('/quiet', async (request, response) => {
  const parsed = requestSchema.safeParse(request.body)
  if (!parsed.success) {
    response.status(400).json({
      error: 'invalid_route_candidates',
      message: 'The route candidates are incomplete or invalid.',
    })
    return
  }

  try {
    const result = await selectQuietRoute(
      parsed.data.candidates,
      new Date(parsed.data.departureTime),
    )
    response.setHeader('Cache-Control', 'no-store')
    response.json(result)
  } catch (error) {
    response.status(error instanceof ForecastUnavailableError ? 503 : 502).json({
      error: 'quiet_route_unavailable',
      message: error instanceof Error
        ? error.message
        : 'A quiet walking route could not be calculated.',
    })
  }
})

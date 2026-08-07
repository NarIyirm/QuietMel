import { Router } from 'express'

import {
  CrowdSourceError,
  getLiveCrowdSnapshot,
  getPedestrianSensorCatalogue,
} from '../services/crowd.js'
import {
  ForecastUnavailableError,
  getCrowdForecast,
} from '../services/forecast.js'

export const crowdRouter = Router()

crowdRouter.get('/live', async (request, response) => {
  try {
    const forceRefresh = request.query.refresh === '1'
    const snapshot = await getLiveCrowdSnapshot(forceRefresh)
    response.setHeader(
      'Cache-Control',
      forceRefresh
        ? 'no-store'
        : 'public, max-age=30, s-maxage=60, stale-while-revalidate=300',
    )
    response.json(snapshot)
  } catch (error) {
    response.status(error instanceof CrowdSourceError ? 502 : 500).json({
      error: 'crowd_data_unavailable',
      message:
        error instanceof Error
          ? error.message
          : 'Live pedestrian data is unavailable.',
    })
  }
})

crowdRouter.get('/sensors', async (_request, response) => {
  try {
    const catalogue = await getPedestrianSensorCatalogue()
    response.setHeader(
      'Cache-Control',
      'public, max-age=300, s-maxage=21600, stale-while-revalidate=86400',
    )
    response.json(catalogue)
  } catch (error) {
    response.status(error instanceof CrowdSourceError ? 502 : 500).json({
      error: 'sensor_catalogue_unavailable',
      message:
        error instanceof Error
          ? error.message
          : 'Pedestrian sensor locations are unavailable.',
    })
  }
})

crowdRouter.get('/forecast', async (_request, response) => {
  try {
    const forecast = await getCrowdForecast()
    response.setHeader('Cache-Control', 'no-store')
    response.json(forecast)
  } catch (error) {
    response.status(error instanceof ForecastUnavailableError ? 503 : 500).json({
      error: 'crowd_forecast_unavailable',
      message:
        error instanceof Error
          ? error.message
          : 'Crowd forecast data is unavailable.',
    })
  }
})

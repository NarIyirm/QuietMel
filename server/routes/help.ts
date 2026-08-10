import { Router } from 'express'

import {
  getHelpManualAccess,
  HelpManualError,
  listHelpManuals,
} from '../services/helpManuals.js'

export const helpRouter = Router()

helpRouter.get('/manuals', async (_request, response) => {
  try {
    const catalogue = await listHelpManuals()
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300')
    response.json(catalogue)
  } catch (error) {
    response.status(error instanceof HelpManualError ? 503 : 500).json({
      error: 'help_manuals_unavailable',
      message: error instanceof Error ? error.message : 'Help manuals are unavailable.',
    })
  }
})

helpRouter.get('/manuals/:manualId/access', async (request, response) => {
  try {
    const manual = await getHelpManualAccess(request.params.manualId)
    if (!manual) {
      response.status(404).json({
        error: 'help_manual_not_found',
        message: 'The requested help manual does not exist.',
      })
      return
    }

    response.setHeader('Cache-Control', 'private, max-age=300')
    response.json(manual)
  } catch (error) {
    response.status(error instanceof HelpManualError ? 503 : 500).json({
      error: 'help_manual_unavailable',
      message: error instanceof Error ? error.message : 'The help manual is unavailable.',
    })
  }
})


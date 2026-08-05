import dotenv from 'dotenv'

dotenv.config({ path: ['server/.env', '.env.local', '.env'] })

const { default: app } = await import('./app.js')
const { env } = await import('./config/env.js')

app.listen(env.port, () => {
  console.log(`QuietMel API listening on http://localhost:${env.port}`)
})

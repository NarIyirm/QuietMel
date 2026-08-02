export type SensoryPressurePoint = {
  id: string
  name: string
  coordinates: [longitude: number, latitude: number]
  pressure: number
}

// Static MVP estimates inspired by the distribution of City of Melbourne
// pedestrian sensors. These are illustrative values, not live sensor readings.
export const SENSORY_PRESSURE_POINTS: SensoryPressurePoint[] = [
  { id: 'flinders-swanston', name: 'Flinders Street and Swanston Street', coordinates: [144.9671, -37.8183], pressure: 98 },
  { id: 'federation-square', name: 'Federation Square', coordinates: [144.9691, -37.8179], pressure: 86 },
  { id: 'southern-cross', name: 'Southern Cross Station', coordinates: [144.9525, -37.8183], pressure: 91 },
  { id: 'bourke-mall-west', name: 'Bourke Street Mall west', coordinates: [144.9632, -37.8136], pressure: 88 },
  { id: 'bourke-mall-east', name: 'Bourke Street Mall east', coordinates: [144.9661, -37.8132], pressure: 93 },
  { id: 'melbourne-central', name: 'Melbourne Central', coordinates: [144.9623, -37.8101], pressure: 90 },
  { id: 'state-library', name: 'State Library forecourt', coordinates: [144.9650, -37.8098], pressure: 78 },
  { id: 'qv-melbourne', name: 'QV Melbourne', coordinates: [144.9658, -37.8107], pressure: 82 },
  { id: 'queen-victoria-market', name: 'Queen Victoria Market', coordinates: [144.9568, -37.8076], pressure: 84 },
  { id: 'flagstaff', name: 'Flagstaff Station', coordinates: [144.9560, -37.8119], pressure: 66 },
  { id: 'parliament', name: 'Parliament Station', coordinates: [144.9729, -37.8110], pressure: 70 },
  { id: 'collins-swanston', name: 'Collins Street and Swanston Street', coordinates: [144.9670, -37.8155], pressure: 82 },
  { id: 'collins-william', name: 'Collins Street and William Street', coordinates: [144.9587, -37.8161], pressure: 68 },
  { id: 'elizabeth-flinders', name: 'Elizabeth Street and Flinders Street', coordinates: [144.9640, -37.8185], pressure: 83 },
  { id: 'elizabeth-lonsdale', name: 'Elizabeth Street and Lonsdale Street', coordinates: [144.9618, -37.8121], pressure: 72 },
  { id: 'rmit', name: 'RMIT Swanston Street', coordinates: [144.9639, -37.8084], pressure: 73 },
  { id: 'chinatown', name: 'Chinatown', coordinates: [144.9688, -37.8117], pressure: 75 },
  { id: 'docklands-central', name: 'Docklands Central', coordinates: [144.9465, -37.8158], pressure: 57 },
  { id: 'marvel-stadium', name: 'Marvel Stadium', coordinates: [144.9475, -37.8165], pressure: 76 },
  { id: 'southbank-promenade', name: 'Southbank Promenade', coordinates: [144.9650, -37.8207], pressure: 72 },
  { id: 'crown', name: 'Crown Promenade', coordinates: [144.9577, -37.8236], pressure: 80 },
  { id: 'arts-centre', name: 'Arts Centre Melbourne', coordinates: [144.9685, -37.8217], pressure: 65 },
  { id: 'melbourne-convention', name: 'Melbourne Convention Centre', coordinates: [144.9524, -37.8252], pressure: 62 },
  { id: 'carlton-south', name: 'Carlton south', coordinates: [144.9660, -37.8027], pressure: 42 },
  { id: 'fitzroy-gardens', name: 'Fitzroy Gardens', coordinates: [144.9802, -37.8125], pressure: 22 },
  { id: 'carlton-gardens', name: 'Carlton Gardens', coordinates: [144.9713, -37.8054], pressure: 26 },
  { id: 'birrarung-marr', name: 'Birrarung Marr', coordinates: [144.9746, -37.8175], pressure: 34 },
  { id: 'royal-botanic-north', name: 'Royal Botanic Gardens north', coordinates: [144.9766, -37.8270], pressure: 18 },
  { id: 'royal-botanic-south', name: 'Royal Botanic Gardens south', coordinates: [144.9796, -37.8304], pressure: 14 },
  { id: 'royal-park-edge', name: 'Royal Park edge', coordinates: [144.9518, -37.7958], pressure: 16 },
]

import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const ADMIN_KEY = process.env.OPS_ADMIN_KEY || 'ico-admin-2026'
const OPS_PINS_KEY = 'ico_ops_pins'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — list current PINs (requires admin key)
  if (req.method === 'GET') {
    const { adminKey } = req.query
    if (adminKey !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' })
    const pins = await kv.get(OPS_PINS_KEY) || { '2580': 'ICO Ops Team' }
    return res.status(200).json({ pins })
  }

  // POST — add or update a PIN
  if (req.method === 'POST') {
    const { adminKey, pin, name } = req.body
    if (adminKey !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' })
    if (!pin || !name) return res.status(400).json({ error: 'pin and name required' })
    if (pin.length < 4 || pin.length > 6) return res.status(400).json({ error: 'PIN must be 4-6 digits' })
    const pins = await kv.get(OPS_PINS_KEY) || {}
    pins[pin] = name
    await kv.set(OPS_PINS_KEY, pins)
    return res.status(200).json({ ok: true, pins })
  }

  // DELETE — remove a PIN
  if (req.method === 'DELETE') {
    const { adminKey, pin } = req.body
    if (adminKey !== ADMIN_KEY) return res.status(401).json({ error: 'Invalid admin key' })
    const pins = await kv.get(OPS_PINS_KEY) || {}
    delete pins[pin]
    await kv.set(OPS_PINS_KEY, pins)
    return res.status(200).json({ ok: true, pins })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

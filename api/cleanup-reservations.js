import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  // One-time cleanup: remove scoreBreakdown from all reservations to slim Redis key
  try {
    const all = await kv.get('ico_reservations') || []
    let cleaned = 0
    const slimmed = all.map(r => {
      if (r.scoreBreakdown || r.nearbyBCNote) {
        cleaned++
        const { scoreBreakdown, nearbyBCNote, ...slim } = r
        return slim
      }
      return r
    })
    await kv.set('ico_reservations', slimmed)
    
    const json = JSON.stringify(slimmed)
    return res.status(200).json({ 
      ok: true, 
      total: all.length, 
      cleaned,
      newSizeKB: Math.round(json.length / 1024)
    })
  } catch(e) {
    return res.status(500).json({ error: e.message })
  }
}

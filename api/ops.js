import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const OPS_PINS_KEY = 'ico_ops_pins'

// Default ops pins — can be updated via admin
const DEFAULT_PINS = {
  '2580': 'ICO Ops Team',  // Default PIN - change via Redis key ico_ops_pins
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // GET — verify PIN and return ops identity
  if (req.method === 'GET') {
    const { pin } = req.query
    if (!pin) return res.status(400).json({ error: 'PIN required' })
    try {
      const pins = await kv.get(OPS_PINS_KEY) || DEFAULT_PINS
      const name = pins[pin]
      if (!name) return res.status(401).json({ error: 'Invalid PIN' })
      return res.status(200).json({ ok: true, name, pin })
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  // POST — ops approves or declines a reservation
  if (req.method === 'POST') {
    const { pin, reservationId, action, notes } = req.body
    if (!pin || !reservationId || !action) {
      return res.status(400).json({ error: 'Missing pin, reservationId, or action' })
    }

    try {
      // Verify PIN
      const pins = await kv.get(OPS_PINS_KEY) || DEFAULT_PINS
      const opsName = pins[pin]
      if (!opsName) return res.status(401).json({ error: 'Invalid PIN' })

      // Update reservation
      const all = await kv.get('ico_reservations') || []
      const idx = all.findIndex(r => r.id === reservationId)
      if (idx === -1) return res.status(404).json({ error: 'Reservation not found' })

      const r = all[idx]
      const respondedAt = new Date().toISOString()
      const elapsed = r.submittedAt
        ? Math.round((new Date(respondedAt) - new Date(r.submittedAt)) / 60000)
        : null

      const opsStatus = action === 'approve' ? 'APPROVED' : 'DECLINED'
      all[idx] = {
        ...r,
        opsStatus,
        opsNotes: notes || null,
        opsRespondedAt: respondedAt,
        opsRespondedBy: opsName,
        elapsedMinutes: elapsed,
      }
      await kv.set('ico_reservations', all)

      // Notify RSM via /api/notify
      const reservation = all[idx]
      if (reservation.reservedByEmail) {
        await fetch(`${process.env.APP_URL || 'https://ico-availability.vercel.app'}/api/notify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'notify_rsm',
            reservation,
            approved: action === 'approve'
          })
        }).catch(e => console.error('RSM notify failed:', e))
      }

      return res.status(200).json({ ok: true, reservation: all[idx], opsName })
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  const { id, days } = req.query
  if (!id) return res.status(400).send('Missing reservation ID')

  try {
    const all = await kv.get('ico_reservations') || []
    const idx = all.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).send('Reservation not found')

    const r = all[idx]
    const daysToAdd = parseInt(days) || 7
    const newExpiry = new Date(Math.max(new Date(r.expiresAt).getTime(), Date.now()) + daysToAdd * 86400000)

    all[idx] = {
      ...r,
      expiresAt: newExpiry.toISOString(),
      status: 'active',
      expiryWarningSent: false,  // reset so warning fires again if needed
      extendedAt: new Date().toISOString(),
      extendedDays: (r.extendedDays || 0) + daysToAdd,
    }
    await kv.set('ico_reservations', all)

    // Redirect to ICO Intelligence
    return res.redirect(302, `https://ico-availability.vercel.app?zip=${r.zip}&leads=${r.leadsReserved}`)
  } catch(e) {
    return res.status(500).send('Error extending reservation: ' + e.message)
  }
}

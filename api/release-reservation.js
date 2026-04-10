import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  const { id } = req.query
  if (!id) return res.status(400).send('Missing reservation ID')

  try {
    const all = await kv.get('ico_reservations') || []
    const idx = all.findIndex(r => r.id === id)
    if (idx === -1) return res.status(404).send('Reservation not found')

    const r = all[idx]
    all[idx] = {
      ...r,
      status: 'expired',
      releasedAt: new Date().toISOString(),
      releasedVia: 'expiry_email',
    }
    await kv.set('ico_reservations', all)

    // Show a simple confirmation page
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head><title>Leads Released</title></head>
      <body style="font-family:Arial,sans-serif;max-width:480px;margin:60px auto;text-align:center;color:#1e293b;">
        <div style="background:#00205b;color:#fff;padding:20px;border-radius:10px 10px 0 0;">
          <strong style="font-size:18px;">ICO Intelligence</strong>
        </div>
        <div style="border:1px solid #e2e8f0;padding:32px;border-radius:0 0 10px 10px;">
          <div style="font-size:32px;margin-bottom:12px;">✓</div>
          <h2 style="margin:0 0 8px;color:#00205b;">Leads Released</h2>
          <p style="color:#64748b;font-size:14px;">${r.leadsReserved} leads for <strong>${r.dealerName}</strong> (${r.zip}) have been released back to the pool.</p>
          <a href="https://ico-availability.vercel.app" style="display:inline-block;margin-top:20px;background:#00205b;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;">Back to ICO Intelligence</a>
        </div>
      </body>
      </html>
    `)
  } catch(e) {
    return res.status(500).send('Error releasing reservation: ' + e.message)
  }
}

import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const RESEND_KEY = process.env.RESEND_API_KEY
const OPS_EMAIL = 'blvwfox@gmail.com'  // TODO: use reservedByEmail after domain verification
const APP_URL = 'https://ico-availability.vercel.app'

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) return { ok: false, reason: 'no_key' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${RESEND_KEY}`
    },
    body: JSON.stringify({
      from: 'ICO Intelligence <onboarding@resend.dev>',
      to: [to],
      subject,
      html
    })
  })
  return { ok: res.ok, data: await res.json() }
}

function expiryWarningHtml(r, daysLeft) {
  const extendUrl = `${APP_URL}/api/reservations?action=extend&id=${r.id}&days=7`
  const releaseUrl = `${APP_URL}/api/reservations?action=release&id=${r.id}`
  const viewUrl = `${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}`
  const expiryDate = new Date(r.expiresAt).toLocaleDateString('en-US', { 
    month: 'long', day: 'numeric', year: 'numeric' 
  })

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:24px 0;">
<tr><td align="center">
<table width="580" cellpadding="0" cellspacing="0" style="max-width:580px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#00205b;border-radius:10px 10px 0 0;padding:18px 24px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="padding-right:14px;border-right:1px solid rgba(255,255,255,.2);">
                <div style="background:#f5a800;border-radius:5px;padding:5px 9px;text-align:center;">
                  <div style="color:#00205b;font-size:8px;font-weight:700;letter-spacing:1px;">KELLEY</div>
                  <div style="color:#00205b;font-size:10px;font-weight:900;">BLUE BOOK</div>
                  <div style="color:#00205b;font-size:7px;font-weight:700;letter-spacing:1px;">ICO</div>
                </div>
              </td>
              <td style="padding-left:14px;">
                <div style="color:#fff;font-size:18px;font-weight:700;">ICO Intelligence</div>
                <div style="color:rgba(255,255,255,.4);font-size:10px;letter-spacing:1px;text-transform:uppercase;">Reservation Expiry Notice</div>
              </td>
            </tr>
          </table>
        </td>
        <td align="right">
          <span style="background:#f97316;color:#fff;font-size:11px;font-weight:700;padding:6px 12px;border-radius:4px;">
            ⏰ EXPIRES IN ${daysLeft} DAY${daysLeft !== 1 ? 'S' : ''}
          </span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Body -->
  <tr><td style="background:#fff;border:1px solid #e2e8f0;border-top:none;padding:24px;">

    <p style="font-size:15px;color:#1e293b;margin:0 0 16px;">Hi ${r.reservedBy},</p>
    <p style="font-size:14px;color:#475569;line-height:1.6;margin:0 0 20px;">
      Your lead reservation for <strong>${r.dealerName}</strong> in zip <strong>${r.zip}</strong> 
      (${r.city}, ${r.state}) expires on <strong>${expiryDate}</strong>.
    </p>

    <!-- Reservation details -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="font-size:12px;color:#64748b;padding:4px 0;">Dealer</td>
          <td style="font-size:13px;font-weight:700;color:#00205b;text-align:right;">${r.dealerName}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#64748b;padding:4px 0;">Zip / Market</td>
          <td style="font-size:13px;color:#1e293b;text-align:right;">${r.zip} — ${r.city}, ${r.state}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#64748b;padding:4px 0;">Leads Reserved</td>
          <td style="font-size:13px;font-weight:700;color:#f5a800;text-align:right;">${r.leadsReserved.toLocaleString()}/mo</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#64748b;padding:4px 0;">Ops Status</td>
          <td style="font-size:13px;color:#1e293b;text-align:right;">${r.opsStatus || 'Pending'}</td>
        </tr>
      </table>
    </div>

    <!-- Question -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin-bottom:20px;text-align:center;">
      <div style="font-size:15px;font-weight:700;color:#92400e;margin-bottom:6px;">Has this deal been closed won?</div>
      <div style="font-size:13px;color:#92400e;">If the dealer signed, leads will be auto-detected on the next Dealer Export upload.<br>If not, you can extend your reservation or release the leads back to the pool.</div>
    </div>

    <!-- Action buttons -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr>
        <td style="padding-right:8px;">
          <a href="${extendUrl}" style="display:block;text-align:center;background:#00205b;color:#fff;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">
            ⏱ Extend 7 Days
          </a>
        </td>
        <td style="padding-left:8px;">
          <a href="${releaseUrl}" style="display:block;text-align:center;background:#fff;color:#64748b;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;border:1px solid #e2e8f0;">
            Release Leads
          </a>
        </td>
      </tr>
    </table>

    <div style="text-align:center;">
      <a href="${viewUrl}" style="font-size:12px;color:#64748b;text-decoration:underline;">View in ICO Intelligence</a>
    </div>

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#00205b;border-radius:0 0 10px 10px;padding:12px 24px;border-top:3px solid #f5a800;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11px;color:rgba(255,255,255,.3);">
          Reservation ID: ${r.id ? r.id.slice(-8) : '—'} · Expires ${expiryDate}
        </td>
        <td align="right" style="font-size:11px;color:rgba(255,255,255,.3);">ICO Intelligence · Kelley Blue Book</td>
      </tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`
}

export default async function handler(req, res) {
  // Vercel cron jobs send a GET request with CRON_SECRET header
  // Protect from unauthorized access
  const authHeader = req.headers.authorization
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const all = await kv.get('ico_reservations') || []
    const now = Date.now()
    const warningMs = 2 * 24 * 60 * 60 * 1000  // 2 days in ms

    let warned = 0
    let updated = false

    for (let i = 0; i < all.length; i++) {
      const r = all[i]
      if (r.status !== 'active') continue
      if (r.expiryWarningSent) continue  // don't send twice

      const expiresAt = new Date(r.expiresAt).getTime()
      const msUntilExpiry = expiresAt - now
      const daysLeft = Math.ceil(msUntilExpiry / (24 * 60 * 60 * 1000))

      if (daysLeft <= 2 && daysLeft > 0) {
        // Send warning email to RSM
        const to = OPS_EMAIL  // TODO: use r.reservedByEmail after domain verification
        await sendEmail(
          to,
          `[ICO Intelligence] ⏰ Reservation expiring in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${r.dealerName} (${r.zip})`,
          expiryWarningHtml(r, daysLeft)
        )
        all[i] = { ...r, expiryWarningSent: true, expiryWarningSentAt: new Date().toISOString() }
        warned++
        updated = true
      }
    }

    if (updated) await kv.set('ico_reservations', all)

    return res.status(200).json({ ok: true, checked: all.length, warned })
  } catch(e) {
    console.error('Cron expiry error:', e)
    return res.status(500).json({ error: e.message })
  }
}

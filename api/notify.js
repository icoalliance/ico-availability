import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const RESEND_KEY = process.env.RESEND_API_KEY
const OPS_EMAIL = 'blvwfox@gmail.com'
const APP_URL = 'https://ico-availability.vercel.app'

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) {
    console.log('No RESEND_API_KEY — email skipped')
    return { ok: false, reason: 'no_key' }
  }
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
  const data = await res.json()
  return { ok: res.ok, data }
}

function verdictColor(verdict) {
  return verdict === 'APPROVED' ? '#00c896'
    : verdict === 'APPROVABLE' ? '#f5a800'
    : verdict === 'REVIEW_REQUIRED' ? '#f97316'
    : '#ff4757'
}

function opsEmailHtml(r, av) {
  const color = verdictColor(r.verdict)
  const isAuto = r.verdict === 'APPROVED'
  const zipUrl = `${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}`
  const approveUrl = `${APP_URL}?ops_action=approve&id=${r.id}`
  const declineUrl = `${APP_URL}?ops_action=decline&id=${r.id}`
  const submittedTime = new Date(r.submittedAt || Date.now()).toLocaleString('en-US', { 
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' 
  })

  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
<div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0;display:flex;align-items:center;gap:12px;">
  <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:1px;">ICO Intelligence</div>
  <div style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:4px;margin-left:auto;">${r.verdict ? r.verdict.replace(/_/g," ") : "SUBMITTED"}</div>
</div>

<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <h2 style="margin:0 0 4px;font-size:18px;">
    ${isAuto ? '✓ Auto-Approved Reservation' : '🔔 New BC Reservation — Action Required'}
  </h2>
  <p style="margin:0 0 20px;color:#64748b;font-size:13px;">Submitted ${submittedTime} ET by ${r.reservedBy}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr style="background:#f8fafc;">
      <td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;width:140px;">Dealer</td>
      <td style="padding:10px 14px;font-size:14px;font-weight:600;">${r.dealerName}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Zip / Market</td>
      <td style="padding:10px 14px;font-size:14px;">${r.zip} — ${r.city}, ${r.state} (${r.dma})</td>
    </tr>
    <tr style="background:#f8fafc;">
      <td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Leads Requested</td>
      <td style="padding:10px 14px;font-size:14px;font-weight:700;color:${color};">${r.leadsReserved.toLocaleString()}/mo</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Approval Score</td>
      <td style="padding:10px 14px;font-size:14px;font-weight:700;color:${color};">${r.approvalScore != null ? r.approvalScore + "/10" : "Pending"}</td>
    </tr>
    ${r.notes ? `<tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">RSM Notes</td><td style="padding:10px 14px;font-size:13px;">${r.notes}</td></tr>` : ''}
    ${av ? `
    <tr><td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Base Availability</td>
    <td style="padding:10px 14px;font-size:14px;font-weight:700;color:${(av.base || 0) >= 0 ? '#00c896' : '#ff4757'}">${av.base != null ? av.base.toLocaleString() : '—'} leads</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Best Ring (0–15mi)</td>
    <td style="padding:10px 14px;font-size:14px;">${av.best15 != null ? av.best15.toLocaleString() : '—'} available</td></tr>
    <tr><td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Best Ring (15–30mi)</td>
    <td style="padding:10px 14px;font-size:14px;">${av.best30 != null ? av.best30.toLocaleString() : '—'} available</td></tr>
    <tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Best Ring (30–45mi)</td>
    <td style="padding:10px 14px;font-size:14px;">${av.best45 != null ? av.best45.toLocaleString() : '—'} available</td></tr>
    ` : ''}
    <tr>
      <td style="padding:10px 14px;font-size:12px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">RSM</td>
      <td style="padding:10px 14px;font-size:13px;">${r.reservedBy} — <a href="mailto:${r.reservedByEmail}">${r.reservedByEmail}</a></td>
    </tr>
  </table>

  <!-- Verdict context -->
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">Why ${r.verdict ? r.verdict.replace(/_/g,' ') : 'this verdict'}?</div>
    <div style="font-size:13px;color:#1e293b;line-height:1.6;">
      ${r.verdict === 'APPROVED' ? 'Base zip availability covers the requested lead volume without needing neighboring zip support. Strong candidate.' : ''}
      ${r.verdict === 'APPROVABLE' ? `Base zip is over-allocated by ${av && av.base < 0 ? Math.abs(av.base).toLocaleString() : '?'} leads, but a neighboring zip within 15–30 miles has sufficient availability to cover the request. The ICO Ops puzzle approach supports approval — please verify the ring booster zip and confirm overlap is sufficient.` : ''}
      ${r.verdict === 'REVIEW_REQUIRED' ? `${r.leadsReserved >= 600 ? 'Request is for 600+ leads — all large opportunities require manual ICO Ops review to ensure dealer readiness and process alignment. ' : ''}${av && av.base < 0 ? `Base zip is over-allocated by ${Math.abs(av.base).toLocaleString()} leads. ` : ''}${av && av.best15 === 0 && av.best30 === 0 ? 'Inner rings show no availability — only the 30–45mi outer ring has capacity. Radius overlap requires manual assessment.' : 'Overage ratio or market constraints require manual review.'}` : ''}
    </div>
  </div>

  ${!isAuto ? `
  <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;margin-bottom:20px;">
    <p style="margin:0 0 12px;font-size:13px;color:#92400e;">
      <strong>Timer started.</strong> Response time is being tracked for reporting purposes.
    </p>
    <div style="display:flex;gap:10px;">
      <a href="${approveUrl}" style="background:#00c896;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">✓ Approve</a>
      <a href="${declineUrl}" style="background:#ff4757;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">✗ Decline</a>
      <a href="${zipUrl}" style="background:#f1f5f9;color:#1e293b;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">View in ICO Intelligence →</a>
    </div>
  </div>
  ` : `
  <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:16px;margin-bottom:20px;">
    <p style="margin:0;font-size:13px;color:#15803d;">
      This reservation was <strong>auto-approved</strong> based on strong base availability. No action required — this is for your awareness only.
    </p>
  </div>
  `}

  <div style="font-size:11px;color:#94a3b8;text-align:center;margin-bottom:8px;">
    Note: ICO Intelligence shows current market availability. The RSM's reservation is visible in the Active Reservations panel.
  </div>
  <a href="${zipUrl}" style="display:block;text-align:center;background:#0f172a;color:#fff;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;">Open ${r.zip} in ICO Intelligence →</a>

  <p style="margin:16px 0 0;font-size:11px;color:#94a3b8;text-align:center;">
    Reservation expires ${new Date(r.expiresAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ID: ${r.id.slice(-8)}
  </p>
</div>
</body></html>`
}

function rsmEmailHtml(r, approved) {
  const color = approved ? '#00c896' : '#ff4757'
  const label = approved ? 'APPROVED' : 'DECLINED'
  return `
<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1e293b;">
<div style="background:#0f172a;padding:20px 24px;border-radius:8px 8px 0 0;">
  <div style="color:#fff;font-size:20px;font-weight:700;">ICO Intelligence</div>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <div style="background:${color}20;border:1px solid ${color}40;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:${color};">${label}</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px;">
      ${r.dealerName} — ${r.zip} ${r.city}, ${r.state}
    </div>
  </div>
  <p style="font-size:14px;">
    ${approved 
      ? `Great news! ICO Ops has approved the reservation for <strong>${r.dealerName}</strong> at <strong>${r.leadsReserved.toLocaleString()} leads/mo</strong>. You can now proceed with generating the agreement in CPQ.`
      : `ICO Ops has declined the reservation for <strong>${r.dealerName}</strong>. ${r.opsNotes ? `<br><br><strong>Reason:</strong> ${r.opsNotes}` : ''}`
    }
  </p>
  ${r.elapsedMinutes ? `<p style="font-size:12px;color:#94a3b8;">Response time: ${r.elapsedMinutes} minute${r.elapsedMinutes !== 1 ? 's' : ''}</p>` : ''}
  <a href="${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}" style="display:block;text-align:center;background:#0f172a;color:#fff;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-top:16px;">View in ICO Intelligence →</a>
</div>
</body></html>`
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { action, reservation, av } = req.body

  try {
    if (action === 'submit_to_ops') {
      // Send email to ICO Ops
      const emailResult = await sendEmail(
        OPS_EMAIL,
        `[ICO Intelligence] ${(reservation.verdict || "SUBMITTED").replace(/_/g," ")} — ${reservation.dealerName} (${reservation.zip})`,
        opsEmailHtml(reservation, av)
      )

      // Update reservation as submitted
      const all = await kv.get('ico_reservations') || []
      const idx = all.findIndex(r => r.id === reservation.id)
      if (idx >= 0) {
        all[idx].submittedToOps = true
        all[idx].submittedAt = new Date().toISOString()
        await kv.set('ico_reservations', all)
      }

      return res.status(200).json({ ok: true, emailResult })
    }

    if (action === 'notify_rsm') {
      // Send approval/decline email to RSM
      const { approved } = req.body
      if (!reservation.reservedByEmail) {
        return res.status(200).json({ ok: false, reason: 'no_rsm_email' })
      }
      const emailResult = await sendEmail(
        reservation.reservedByEmail,
        `[ICO Intelligence] Your reservation for ${reservation.dealerName} has been ${approved ? 'APPROVED' : 'DECLINED'}`,
        rsmEmailHtml(reservation, approved)
      )
      return res.status(200).json({ ok: true, emailResult })
    }

    return res.status(400).json({ error: 'Unknown action' })
  } catch(e) {
    console.error('Notify error:', e)
    return res.status(500).json({ error: e.message })
  }
}

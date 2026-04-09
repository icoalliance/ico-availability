import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const RESEND_KEY = process.env.RESEND_API_KEY
const OPS_EMAIL = 'blvwfox@gmail.com'
const APP_URL = 'https://ico-availability.vercel.app'
const KBB_LOGO_B64 = 'data:image/png;base64,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'

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
  // Single CTA: View in ICO Intelligence (includes id for sticky bar)
  const viewUrl = `${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}&id=${r.id}&ops_action=review`
  const submittedTime = new Date(r.submittedAt || Date.now()).toLocaleString('en-US', { 
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short' 
  })
  const verdictLabel = r.verdict ? r.verdict.replace(/_/g,' ') : 'SUBMITTED'
  
  // Score bar width
  const scoreWidth = r.approvalScore ? Math.round((r.approvalScore / 10) * 100) : 0
  const scoreColor = r.approvalScore >= 8 ? '#00c896' : r.approvalScore >= 6 ? '#f5a800' : '#ff4757'

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#0f172a;border-radius:10px 10px 0 0;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td valign="middle">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="padding-right:14px;border-right:1px solid rgba(255,255,255,.15);">
                <img src="${KBB_LOGO_B64}" alt="Kelley Blue Book" width="76" height="50" style="display:block;" />
              </td>
              <td valign="middle" style="padding-left:14px;">
                <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:.5px;font-family:Arial,sans-serif;line-height:1.2;">ICO Intelligence</div>
                <div style="color:rgba(255,255,255,.4);font-size:10px;font-family:Arial,sans-serif;margin-top:2px;letter-spacing:.5px;">KELLEY BLUE BOOK ICO</div>
              </td>
            </tr>
          </table>
        </td>
        <td align="right" valign="middle">
          <span style="background:${color};color:#fff;font-size:12px;font-weight:700;padding:7px 16px;border-radius:5px;letter-spacing:.5px;white-space:nowrap;">${verdictLabel}</span>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Title bar -->
  <tr><td style="background:${color}18;border-left:4px solid ${color};border-right:1px solid #e2e8f0;padding:14px 28px;">
    <div style="font-size:16px;font-weight:700;color:#0f172a;">${isAuto ? '✓ Auto-Approved Reservation' : '🔔 New BC Reservation — Action Required'}</div>
    <div style="font-size:12px;color:#64748b;margin-top:3px;">Submitted ${submittedTime} ET by ${r.reservedBy}</div>
  </td></tr>

  <!-- Main content -->
  <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:24px 28px;">

    <!-- Key details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;width:160px;">Dealer</td>
        <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#0f172a;">${r.dealerName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Zip / Market</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;">${r.zip} — ${r.city}, ${r.state} (${r.dma})</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Leads Requested</td>
        <td style="padding:10px 14px;font-size:15px;font-weight:700;color:${color};">${r.leadsReserved ? r.leadsReserved.toLocaleString() : '—'}/mo</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">RSM</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;">${r.reservedBy}${r.reservedByEmail ? ' · ' + r.reservedByEmail : ''}</td>
      </tr>
      ${r.notes ? `<tr style="background:#f8fafc;"><td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Notes</td><td style="padding:10px 14px;font-size:13px;color:#1e293b;font-style:italic;">${r.notes}</td></tr>` : ''}
    </table>

    <!-- Approval Score -->
    <div style="margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px;">
        <tr>
          <td style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;vertical-align:middle;">Approval Likelihood Score</td>
          <td align="right" style="vertical-align:middle;">
            <span style="font-size:22px;font-weight:700;color:${scoreColor};">${r.approvalScore != null ? r.approvalScore : '—'}</span><span style="font-size:13px;color:#94a3b8;">/10</span>
          </td>
        </tr>
      </table>
      <div style="background:#e2e8f0;border-radius:4px;height:8px;overflow:hidden;">
        <div style="background:${scoreColor};height:8px;width:${scoreWidth}%;border-radius:4px;"></div>
      </div>
    </div>

    <!-- Availability -->
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">Market Availability</div>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:4px 0;font-size:13px;color:#1e293b;">Base Zip Pool</td>
          <td align="right" style="font-size:13px;font-weight:700;color:${av && av.base < 0 ? '#ff4757' : '#00c896'};">${av && av.base != null ? av.base.toLocaleString() : '—'} leads</td>
        </tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 15mi</td><td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best15 != null ? av.best15.toLocaleString() : '—'} available</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 30mi</td><td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best30 != null ? av.best30.toLocaleString() : '—'} available</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 45mi</td><td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best45 != null ? av.best45.toLocaleString() : '—'} available</td></tr>
      </table>
    </div>

    <!-- Why verdict -->
    <div style="background:${color}0d;border:1px solid ${color}30;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Why ${verdictLabel}?</div>
      <div style="font-size:13px;color:#1e293b;line-height:1.7;">
        ${r.verdict === 'APPROVED' ? 'Base zip availability covers the full requested lead volume. No ring booster needed. Strong approval candidate.' : ''}
        ${r.verdict === 'APPROVABLE' ? `Base zip is over-allocated by <strong>${av && av.base < 0 ? Math.abs(av.base).toLocaleString() : '?'} leads</strong>, but a neighboring zip within 15–30 miles has <strong>${av && av.best15 ? av.best15.toLocaleString() : av && av.best30 ? av.best30.toLocaleString() : '?'} leads available</strong> — sufficient to cover the request using the ICO Ops puzzle approach. Please verify the ring booster zip and confirm the radius overlap is sufficient.` : ''}
        ${r.verdict === 'REVIEW_REQUIRED' ? `${r.leadsReserved >= 600 ? '<strong>600+ lead request</strong> — all large opportunities require manual ICO Ops review for dealer readiness. ' : ''}${av && av.base < 0 ? `Base zip is over-allocated by <strong>${Math.abs(av.base).toLocaleString()} leads</strong>. ` : ''}${av && av.best15 === 0 && av.best30 === 0 ? 'Inner rings show no availability — only the 30–45mi outer ring has capacity. Radius overlap requires manual assessment.' : 'Market constraints require manual review.'}` : ''}
      </div>
      ${r.nearbyBCNote ? `<div style="margin-top:10px;font-size:12px;color:#92400e;background:#fffbeb;padding:8px 10px;border-radius:5px;">⚠ ${r.nearbyBCNote}</div>` : ''}
      ${r.scoreBreakdown ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid ${color}20;padding-top:10px;">
        ${r.scoreBreakdown.map(f => `<tr>
          <td style="padding:3px 0;font-size:12px;color:#475569;">${f.name}</td>
          <td align="right" style="font-size:12px;font-weight:700;color:${f.val >= f.max ? '#00c896' : f.val === 0 ? '#ff4757' : '#f5a800'};">${f.val}/${f.max}</td>
        </tr>`).join('')}
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:6px 0;font-size:13px;font-weight:700;color:#0f172a;">Total</td>
          <td align="right" style="font-size:15px;font-weight:700;color:${scoreColor};">${r.approvalScore}/10</td>
        </tr>
      </table>` : ''}
    </div>

    ${!isAuto ? `
    <!-- Timer note -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e;">
      <strong>Timer started.</strong> Response time is tracked for reporting. Reply speed matters — time kills deals.
    </div>

    <!-- Single CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td align="center">
          <a href="${viewUrl}" style="display:inline-block;background:#0f172a;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.5px;">
            Review &amp; Action in ICO Intelligence →
          </a>
        </td>
      </tr>
      <tr><td align="center" style="padding-top:10px;font-size:11px;color:#94a3b8;">
        Opens ICO Intelligence with this reservation pre-loaded. Enter your Ops PIN to approve or decline.
      </td></tr>
    </table>
    ` : `
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;font-size:13px;color:#15803d;">
      This reservation was <strong>auto-approved</strong> based on strong base availability. No action required — for your awareness only.
    </div>
    `}

  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#0f172a;border-radius:0 0 10px 10px;padding:14px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="font-size:11px;color:rgba(255,255,255,.3);">
          Reservation expires ${new Date(r.expiresAt).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})} · ID: ${r.id ? r.id.slice(-8) : '—'}
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
      // Send to OPS_EMAIL in test mode regardless of reservedByEmail
      // In test mode: always send to verified Gmail since Resend free tier restricts recipients
      const rsmTo = OPS_EMAIL  // TODO: change to reservation.reservedByEmail after domain verification
      const emailResult = await sendEmail(
        rsmTo,
        `[ICO Intelligence] ${approved ? '✓ APPROVED' : '✗ DECLINED'} — ${reservation.dealerName} (${reservation.zip})`,
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

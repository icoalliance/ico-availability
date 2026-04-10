import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const RESEND_KEY = process.env.RESEND_API_KEY
const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY
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

// Find dealer location using Places Text Search (finds actual business, not zip centroid)
async function geocodeDealer(dealerName, zip) {
  if (!MAPS_KEY) return null
  try {
    // Places Text Search is more accurate for business locations than Geocoding API
    const query = encodeURIComponent(`${dealerName} ${zip}`)
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${MAPS_KEY}`
    const res = await fetch(url)
    const data = await res.json()
    if (data.status === 'OK' && data.results[0]) {
      const loc = data.results[0].geometry.location
      return {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: data.results[0].formatted_address
      }
    }
    // Fallback: try with "car dealership" added for better specificity
    const query2 = encodeURIComponent(`${dealerName} car dealership ${zip}`)
    const url2 = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query2}&key=${MAPS_KEY}`
    const res2 = await fetch(url2)
    const data2 = await res2.json()
    if (data2.status === 'OK' && data2.results[0]) {
      const loc = data2.results[0].geometry.location
      return {
        lat: loc.lat,
        lng: loc.lng,
        formattedAddress: data2.results[0].formatted_address
      }
    }
  } catch(e) {
    console.error('Places search failed:', e)
  }
  return null
}

// Build satellite image URL (hosted by Google — renders in Gmail)
function satelliteImageUrl(lat, lng) {
  return `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=18&size=580x260&maptype=satellite&markers=color:red%7C${lat},${lng}&key=${MAPS_KEY}`
}

function verdictColor(verdict) {
  return verdict === 'APPROVED' ? '#00c896'
    : verdict === 'APPROVABLE' ? '#f5a800'
    : verdict === 'REVIEW_REQUIRED' ? '#f97316'
    : '#ff4757'
}

// Pre-qualification checklist row helper
function checkRow(icon, label, value, note, bg) {
  const bgColor = bg || (icon === '✓' ? '#f0fdf4' : icon === '✗' ? '#fff0f0' : '#fffbeb')
  const iconColor = icon === '✓' ? '#15803d' : icon === '✗' ? '#b91c1c' : '#92400e'
  return `<tr style="background:${bgColor};">
    <td style="padding:7px 12px;width:28px;font-size:14px;color:${iconColor};font-weight:700;">${icon}</td>
    <td style="padding:7px 8px;font-size:12px;color:#1e293b;font-weight:600;">${label}</td>
    <td style="padding:7px 12px;font-size:12px;color:#475569;text-align:right;">${value}</td>
    ${note ? `<td style="padding:7px 12px;font-size:11px;color:#64748b;font-style:italic;">${note}</td>` : '<td></td>'}
  </tr>`
}

function buildPreQualChecklist(r) {
  const rows = []

  // 1. BC Type
  const bcLabel = r.bcType === 'upsell' ? 'Upsell' : 'New BC'
  const threshold = r.bcType === 'upsell' ? 600 : 400
  rows.push(checkRow('ℹ', 'BC Type', bcLabel, '', '#f8fafc'))

  // 2. Dealer Type
  const dtLabel = r.dealerType === 'independent' ? 'Independent' : 'Franchise'
  rows.push(checkRow('ℹ', 'Dealer Type', dtLabel, '', '#f8fafc'))

  // 3. Market Tier + minimum
  if (r.marketTier) {
    const minLeads = r.tierMinLeads || (r.marketTier <= 'B' ? 100 : 50)
    const meetsMin = r.leadsReserved >= minLeads
    rows.push(checkRow(
      meetsMin ? '✓' : '✗',
      `Market Tier ${r.marketTier}`,
      `${r.leadsReserved} leads requested`,
      meetsMin ? `Meets ${minLeads}-lead minimum` : `Below ${minLeads}-lead minimum for Tier ${r.marketTier}`
    ))
  }

  // 4. Threshold check (400 new / 600 upsell)
  const withinThreshold = r.leadsReserved <= threshold
  rows.push(checkRow(
    withinThreshold ? '✓' : '✗',
    'Threshold Check',
    `${r.leadsReserved} / ${threshold} max`,
    withinThreshold ? 'No escalation required' : 'Escalation required'
  ))

  // 5. Approval score
  if (r.approvalScore != null) {
    const scoreOk = r.approvalScore >= 6
    rows.push(checkRow(
      scoreOk ? '✓' : '✗',
      'Approval Score',
      `${r.approvalScore}/10`,
      scoreOk ? 'In approvable range' : 'Below approvable threshold'
    ))
  }

  // 6. Has CRM (RSM-provided)
  if (r.hasCrm !== null && r.hasCrm !== undefined) {
    rows.push(checkRow(
      r.hasCrm ? '✓' : '✗',
      'Has CRM',
      r.hasCrm ? 'Yes' : 'No',
      r.hasCrm ? 'CRM confirmed by RSM' : 'No CRM — lower ROI risk'
    ))
  }

  // 7. Vehicle inventory (independent only)
  if (r.dealerType === 'independent' && r.inventorySize) {
    const inv = r.inventorySize
    const meetsInv = inv !== '<50'
    rows.push(checkRow(
      meetsInv ? '✓' : '✗',
      'Vehicle Inventory',
      inv + ' vehicles',
      meetsInv ? 'Meets 50+ vehicle requirement' : 'Below 50 vehicles — Perf Mgmt approval required'
    ))
  }

  // 8-10. Manual verification items (always shown as warnings)
  rows.push(checkRow('⚠', 'Manheim Account', 'Verify manually', 'Must have active account', '#fffbeb'))
  rows.push(checkRow('⚠', 'Physical Location', 'See satellite image below', 'Not home/gas station/strip mall', '#fffbeb'))
  rows.push(checkRow('⚠', 'Operating Hours', 'Confirm with RSM', 'Must accept consumers during business hours', '#fffbeb'))

  return `
  <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px;">
      Pre-Qualification Checklist
    </div>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-radius:6px;overflow:hidden;border:1px solid #e2e8f0;">
      ${rows.join('')}
    </table>
  </div>`
}

async function opsEmailHtml(r, av) {
  const color = verdictColor(r.verdict)
  const isAuto = r.verdict === 'APPROVED'
  const viewUrl = `${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}&id=${r.id}&ops_action=review`
  const submittedTime = new Date(r.submittedAt || Date.now()).toLocaleString('en-US', {
    timeZone: 'America/New_York', dateStyle: 'medium', timeStyle: 'short'
  })
  const verdictLabel = r.verdict ? r.verdict.replace(/_/g, ' ') : 'SUBMITTED'
  const scoreWidth = r.approvalScore ? Math.round((r.approvalScore / 10) * 100) : 0
  const scoreColor = r.approvalScore >= 8 ? '#00c896' : r.approvalScore >= 6 ? '#f5a800' : '#ff4757'

  // Geocode dealer for satellite image
  let satHtml = ''
  if (MAPS_KEY) {
    const geo = await geocodeDealer(r.dealerName, r.zip)
    if (geo) {
      const imgUrl = satelliteImageUrl(geo.lat, geo.lng)
      satHtml = `
  <div style="margin-bottom:20px;">
    <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">
      Dealer Location — Satellite View
    </div>
    <div style="font-size:11px;color:#94a3b8;margin-bottom:6px;">${geo.formattedAddress}</div>
    <img src="${imgUrl}" width="580" style="display:block;border-radius:6px;border:1px solid #e2e8f0;max-width:100%;" alt="Satellite view of ${r.dealerName}" />
    <div style="font-size:10px;color:#94a3b8;margin-top:4px;">Verify: physical lot, not home/gas station/strip mall</div>
  </div>`
    }
  }

  const prequal = buildPreQualChecklist(r)

  return `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f8;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f8;padding:24px 0;">
<tr><td align="center">
<table width="620" cellpadding="0" cellspacing="0" style="max-width:620px;width:100%;">

  <!-- Header -->
  <tr><td style="background:#00205b;border-radius:10px 10px 0 0;padding:20px 28px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td valign="middle">
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td valign="middle" style="padding-right:16px;border-right:1px solid rgba(255,255,255,.2);">
                <div style="background:#f5a800;border-radius:6px;padding:6px 10px;text-align:center;">
                  <div style="color:#00205b;font-size:9px;font-weight:700;letter-spacing:1px;font-family:Arial,sans-serif;line-height:1.2;">KELLEY</div>
                  <div style="color:#00205b;font-size:11px;font-weight:900;font-family:Arial,sans-serif;line-height:1.1;">BLUE BOOK</div>
                  <div style="color:#00205b;font-size:7px;font-weight:700;letter-spacing:1px;font-family:Arial,sans-serif;">ICO</div>
                </div>
              </td>
              <td valign="middle" style="padding-left:16px;">
                <div style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:.5px;font-family:Arial,sans-serif;line-height:1.2;">ICO Intelligence</div>
                <div style="color:rgba(255,255,255,.5);font-size:10px;font-family:Arial,sans-serif;margin-top:2px;letter-spacing:1px;text-transform:uppercase;">Kelley Blue Book</div>
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
    <div style="font-size:16px;font-weight:700;color:#00205b;">${isAuto ? '✓ Auto-Approved Reservation' : '🔔 New BC Reservation — Action Required'}</div>
    <div style="font-size:12px;color:#64748b;margin-top:3px;">Submitted ${submittedTime} ET by ${r.reservedBy}</div>
  </td></tr>

  <!-- Main content -->
  <tr><td style="background:#ffffff;border:1px solid #e2e8f0;border-top:none;padding:24px 28px;">

    <!-- Key details -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;width:160px;">Dealer</td>
        <td style="padding:10px 14px;font-size:14px;font-weight:700;color:#00205b;">${r.dealerName}</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Zip / Market</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;">${r.zip} — ${r.city}, ${r.state} (${r.dma})${r.marketTier ? ` · <strong>Tier ${r.marketTier}</strong>` : ''}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Leads Requested</td>
        <td style="padding:10px 14px;font-size:15px;font-weight:700;color:${color};">${r.leadsReserved ? r.leadsReserved.toLocaleString() : '—'}/mo</td>
      </tr>
      <tr>
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">BC Type</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;">${r.bcType === 'upsell' ? 'Upsell' : 'New BC'} · ${r.dealerType === 'independent' ? 'Independent' : 'Franchise'} · CRM: ${r.hasCrm === true ? 'Yes' : r.hasCrm === false ? 'No' : 'Not provided'}</td>
      </tr>
      <tr style="background:#f8fafc;">
        <td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">RSM</td>
        <td style="padding:10px 14px;font-size:13px;color:#1e293b;">${r.reservedBy}${r.reservedByEmail ? ' · ' + r.reservedByEmail : ''}</td>
      </tr>
      ${r.notes ? `<tr><td style="padding:10px 14px;font-size:11px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">Notes</td><td style="padding:10px 14px;font-size:13px;color:#1e293b;font-style:italic;">${r.notes}</td></tr>` : ''}
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
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Base Zip Pool</td>
          <td align="right" style="font-size:13px;font-weight:700;color:${av && av.base < 0 ? '#ff4757' : '#00c896'};">${av && av.base != null ? av.base.toLocaleString() : '—'} leads</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 15mi</td>
          <td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best15 != null ? av.best15.toLocaleString() : '—'} available</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 30mi</td>
          <td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best30 != null ? av.best30.toLocaleString() : '—'} available</td></tr>
        <tr><td style="padding:4px 0;font-size:13px;color:#1e293b;">Best within 45mi</td>
          <td align="right" style="font-size:13px;font-weight:700;color:#1e293b;">${av && av.best45 != null ? av.best45.toLocaleString() : '—'} available</td></tr>
      </table>
    </div>

    <!-- Why verdict -->
    <div style="background:${color}0d;border:1px solid ${color}30;border-radius:8px;padding:16px;margin-bottom:20px;">
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">Why ${verdictLabel}?</div>
      <div style="font-size:13px;color:#1e293b;line-height:1.7;">
        ${r.verdict === 'APPROVED' ? 'Base zip availability covers the full requested lead volume. No ring booster needed. Strong approval candidate.' : ''}
        ${r.verdict === 'APPROVABLE' ? `Base zip is over-allocated by <strong>${av && av.base < 0 ? Math.abs(av.base).toLocaleString() : '?'} leads</strong>, but a neighboring zip within 15–30 miles has <strong>${av && av.best15 ? av.best15.toLocaleString() : av && av.best30 ? av.best30.toLocaleString() : '?'} leads available</strong> — sufficient to cover the request using the ICO Ops puzzle approach. Please verify the ring booster zip and confirm the radius overlap is sufficient.` : ''}
        ${r.verdict === 'REVIEW_REQUIRED' ? `${r.leadsReserved >= 400 ? `<strong>${r.bcType === 'upsell' ? '600+' : '400+'} lead request</strong> — requires manual ICO Ops review. ` : ''}${av && av.base < 0 ? `Base zip is over-allocated by <strong>${Math.abs(av.base).toLocaleString()} leads</strong>. ` : ''}${av && av.best15 === 0 && av.best30 === 0 ? 'Inner rings show no availability — only the 30–45mi outer ring has capacity. Radius overlap requires manual assessment.' : 'Market constraints require manual review.'}` : ''}
      </div>
      ${r.nearbyBCNote ? `<div style="margin-top:10px;font-size:12px;color:#92400e;background:#fffbeb;padding:8px 10px;border-radius:5px;">⚠ ${r.nearbyBCNote}</div>` : ''}
      ${r.scoreBreakdown ? `
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;border-top:1px solid ${color}20;padding-top:10px;">
        ${r.scoreBreakdown.map(f => `<tr>
          <td style="padding:3px 0;font-size:12px;color:#475569;">${f.name}</td>
          <td align="right" style="font-size:12px;font-weight:700;color:${f.val >= f.max ? '#00c896' : f.val === 0 ? '#ff4757' : '#f5a800'};">${f.val}/${f.max}</td>
        </tr>`).join('')}
        <tr style="border-top:1px solid #e2e8f0;">
          <td style="padding:6px 0;font-size:13px;font-weight:700;color:#00205b;">Total</td>
          <td align="right" style="font-size:15px;font-weight:700;color:${scoreColor};">${r.approvalScore}/10</td>
        </tr>
      </table>` : ''}
    </div>

    <!-- Pre-Qualification Checklist -->
    ${prequal}

    <!-- Satellite Image -->
    ${satHtml}

    ${!isAuto ? `
    <!-- Timer note -->
    <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:12px 16px;margin-bottom:20px;font-size:13px;color:#92400e;">
      <strong>Timer started.</strong> Response time is tracked for reporting. Reply speed matters — time kills deals.
    </div>

    <!-- Single CTA -->
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <a href="${viewUrl}" style="display:inline-block;background:#00205b;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;letter-spacing:.5px;">
          Review &amp; Action in ICO Intelligence →
        </a>
      </td></tr>
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
  <tr><td style="background:#00205b;border-radius:0 0 10px 10px;padding:14px 28px;border-top:3px solid #f5a800;">
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
<div style="background:#00205b;padding:20px 24px;border-radius:8px 8px 0 0;">
  <div style="color:#fff;font-size:20px;font-weight:700;">ICO Intelligence</div>
</div>
<div style="border:1px solid #e2e8f0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
  <div style="background:${color}20;border:1px solid ${color}40;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center;">
    <div style="font-size:28px;font-weight:700;color:${color};">${label}</div>
    <div style="font-size:13px;color:#64748b;margin-top:4px;">${r.dealerName} — ${r.zip} ${r.city}, ${r.state}</div>
  </div>
  <p style="font-size:14px;">
    ${approved
      ? `Great news! ICO Ops has approved the reservation for <strong>${r.dealerName}</strong> at <strong>${r.leadsReserved.toLocaleString()} leads/mo</strong>. You can now proceed with generating the agreement in CPQ.`
      : `ICO Ops has declined the reservation for <strong>${r.dealerName}</strong>. ${r.opsNotes ? `<br><br><strong>Reason:</strong> ${r.opsNotes}` : ''}`
    }
  </p>
  ${r.elapsedMinutes ? `<p style="font-size:12px;color:#94a3b8;">Response time: ${r.elapsedMinutes} minute${r.elapsedMinutes !== 1 ? 's' : ''}</p>` : ''}
  <a href="${APP_URL}?zip=${r.zip}&leads=${r.leadsReserved}" style="display:block;text-align:center;background:#00205b;color:#fff;padding:12px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;margin-top:16px;">View in ICO Intelligence →</a>
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
      const emailResult = await sendEmail(
        OPS_EMAIL,
        `[ICO Intelligence] ${(reservation.verdict || 'SUBMITTED').replace(/_/g, ' ')} — ${reservation.dealerName} (${reservation.zip})`,
        await opsEmailHtml(reservation, av)
      )

      // Mark reservation as submitted
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
      const { approved } = req.body
      const rsmTo = OPS_EMAIL  // TODO: swap to reservation.reservedByEmail after domain verification
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

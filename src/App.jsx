import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { calcAvailability, getZipInfo, fmtN, fmtPct, LPO } from './utils'
import { fetchReservations, createReservation, cancelReservation, updateReservation, daysUntil, fmtDate } from './api'
import { dealerMap } from './dealerMap'
import { KBB_LOGO_B64 } from './kbbLogo'
import { coordsMap } from './coordsMap'
import { matMap } from './matMap'
import { groupIndex } from './groupIndex'
import { haversine } from './utils'
import { whitespaceZips, dmaSaturation, DATA_DATE, DATA_BC_COUNT } from './marketData'
import { demoMap } from './demoMap'
import { comparables as comparablesMap } from './comparables'
import { offerMap, OFFER_MONTH } from './offerMap'

// ── Small helpers ──────────────────────────────────────────────────────────
const pctClass = p => !p ? '' : p >= 1 ? 'pct-green' : p >= 0.75 ? 'pct-yellow' : 'pct-red'
const availColor = v => v > 0 ? 'av-pos' : v < 0 ? 'av-neg' : ''

function Tag({ val, desired }) {
  if (!desired || val === null) return null
  if (val >= desired) return <span className="av-check">✓ covers {fmtN(desired)}</span>
  if (val > 0) return <span className="av-short">{fmtN(desired - val)} short</span>
  return <span className="av-short">not enough</span>
}

// ── 4 availability cards ───────────────────────────────────────────────────
function AvailCards({ av, desired }) {
  if (!av) return null
  const { base, best15, best30, best45, ring15, ring30, ring45, reserved } = av

  const bestInRing = ring => ring.reduce((b, e) => (!b || e.avail > b.avail) ? e : b, null)
  const bz15 = bestInRing(ring15.filter(e => e.avail > 0))
  const bz30 = bestInRing(ring30.filter(e => e.avail > 0))
  const bz45 = bestInRing(ring45.filter(e => e.avail > 0))

  const subLabel = bz => bz ? `Best: ${bz.zip} (${bz.dist}mi) — ${fmtN(bz.avail)} avail` : 'No headroom found'

  const n15 = ring15.filter(e => e.avail > 0).length
  const n30 = ring30.filter(e => e.avail > 0).length
  const n45 = ring45.filter(e => e.avail > 0).length

  const [open, setOpen] = useState(false)

  const allRows = [...ring15, ...ring30, ...ring45].filter(e => e.avail > 0)
    .sort((a,b) => a.dist - b.dist)

  return (
    <div className="avail-panel">
      <div className="avail-panel-header">
        <div className="avail-title">Availability by Radius</div>
        <div className="lpo-badge">LPO {LPO.current} · {LPO.month}</div>
      </div>

      {desired && (
        <div className="lpo-note">
          At {LPO.current} leads/offer: {fmtN(desired)} leads ≈ {Math.round(desired / LPO.current)} unique offers
        </div>
      )}

      <div className="ring-grid4">
        {/* Card 1: Base */}
        <div className={`ring-card ${base !== null && base > 0 ? 'ring-ok' : 'ring-neg'}`}>
          <div className="ring-label">Base Zip Pool</div>
          <div className={`ring-avail ${availColor(base)}`}>{fmtN(base)}</div>
          <div className="ring-sublabel">
            {base < 0 ? `Oversold by ${fmtN(Math.abs(base))}` : base === 0 ? 'Fully allocated' : 'Available in zip pool'}
            {reserved > 0 && <span className="res-badge">{fmtN(reserved)} reserved</span>}
          </div>
          <div className="ring-max"><Tag val={base} desired={desired} /></div>
        </div>

        {/* Card 2: 0-15mi */}
        <div className={`ring-card ${best15 > 0 ? 'ring-boost1' : 'ring-neg'}`}>
          <div className="ring-label">0 – 15 mi <span className="ring-count">({n15} zips)</span></div>
          <div className={`ring-avail ${best15 > 0 ? 'av-pos' : 'av-neg'}`}>{fmtN(best15)}</div>
          <div className="ring-sublabel">
            {subLabel(bz15)}
            {av.baseOverage > 0 && <span className="netting-note"> · net of {fmtN(av.baseOverage)} overage</span>}
          </div>
          {bz15 && bz15.underdelivery && <div className="ud-warning">⚠ {bz15.zip} trending underdelivery ({bz15.underMonths.join(', ')}) — ICO Ops may not approve</div>}
          <div className="ring-max"><Tag val={best15} desired={desired} /></div>
        </div>

        {/* Card 3: 15-30mi */}
        <div className={`ring-card ${best30 > 0 ? 'ring-boost2' : 'ring-neg'}`}>
          <div className="ring-label">15 – 30 mi <span className="ring-count">({n30} zips)</span></div>
          <div className={`ring-avail ${best30 > 0 ? 'av-pos' : 'av-neg'}`}>{fmtN(best30)}</div>
          <div className="ring-sublabel">
            {subLabel(bz30)}
            {av.baseOverage > 0 && <span className="netting-note"> · net of {fmtN(av.baseOverage)} overage</span>}
          </div>
          {bz30 && bz30.underdelivery && <div className="ud-warning">⚠ {bz30.zip} trending underdelivery ({bz30.underMonths.join(', ')}) — ICO Ops may not approve</div>}
          <div className="ring-max"><Tag val={best30} desired={desired} /></div>
        </div>

        {/* Card 4: 30-45mi */}
        <div className={`ring-card ${best45 > 0 ? 'ring-boost3' : 'ring-neg'}`}>
          <div className="ring-label">30 – 45 mi <span className="ring-count">({n45} zips)</span></div>
          <div className={`ring-avail ${best45 > 0 ? 'av-pos' : 'av-neg'}`}>{fmtN(best45)}</div>
          <div className="ring-sublabel">{subLabel(bz45)}</div>
          {bz45 && bz45.underdelivery && <div className="ud-warning">⚠ {bz45.zip} trending underdelivery ({bz45.underMonths.join(', ')}) — ICO Ops may not approve</div>}
          <div className="ring-max"><Tag val={best45} desired={desired} /></div>
        </div>
      </div>

      {allRows.length > 0 && (
        <details className="avail-details" open={open} onToggle={e => setOpen(e.target.open)}>
          <summary>Show nearby zips ({allRows.length} with positive availability)</summary>
          <table className="avail-table">
            <thead><tr><th>Distance · Zip · Location</th><th className="av-num">Available</th><th>Notes</th></tr></thead>
            <tbody>
              {ring15.filter(e=>e.avail>0).length > 0 && <tr className="av-section"><td colSpan={3}>0–15 mi ({n15} zips)</td></tr>}
              {ring15.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} baseOverage={av.baseOverage} />)}
              {ring30.filter(e=>e.avail>0).length > 0 && <tr className="av-section"><td colSpan={3}>15–30 mi ({n30} zips)</td></tr>}
              {ring30.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} baseOverage={av.baseOverage} />)}
              {ring45.filter(e=>e.avail>0).length > 0 && <tr className="av-section"><td colSpan={3}>30–45 mi ({n45} zips)</td></tr>}
              {ring45.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} baseOverage={av.baseOverage} />)}
            </tbody>
          </table>
        </details>
      )}

      {av.hasUnderdeliveryWarning && (
        <div className="ud-banner">
          <strong>⚠ Underdelivery Caution</strong> — {av.underdeliveryCount} nearby zip{av.underdeliveryCount > 1 ? 's have' : ' has'} shown underdelivery in 2+ of the last 3 months. ICO Ops may reduce or deny approval in these areas regardless of available lead counts. Review the dealer table below for delivery trends.
        </div>
      )}

      <div className="lpo-panel">
        <div className="lpo-title">Leads per Offer</div>
        <div className="lpo-months">
          {[['Jan \'26', LPO.jan], ['Feb \'26', LPO.feb], ['Mar \'26', LPO.mar]].map(([lbl, val], i) => (
            <div key={lbl} className={`lpo-mo ${i === 2 ? 'lpo-mo-current' : ''}`}>
              <div className="lpo-mo-label">{lbl}</div>
              <div className="lpo-mo-val">{val}</div>
            </div>
          ))}
        </div>
        <div className="lpo-explain">
          Each offer routes to <strong>{LPO.current}</strong> dealers on average based on actual delivery (Attribution Report). Note: the MAT models availability using a <strong>3x routing assumption</strong> — meaning it expects each offer to go to 3 dealers. Since actuals run at 2x, a negative base zip doesn't mean the market is truly exhausted; it means the zip is over-allocated against the 3x model. Neighboring zip availability confirms real demand exists and is why ICO Ops can approve new BCs in negative zips.
        </div>
      </div>
    </div>
  )
}

function ZipRow({ e, baseOverage }) {
  const showNetting = baseOverage > 0 && e.dist <= 30
  return (
    <tr className={`av-detail ${e.underdelivery ? 'ud-row' : ''}`}>
      <td className="av-indent">
        {e.dist}mi · {e.zip} · {e.name}
        {e.hasBC && <span className="bc-pill">BC</span>}
        {e.underdelivery && <span className="ud-pill">⚠ underdelivery</span>}
      </td>
      <td className="av-num av-pos">
        {fmtN(e.avail)}
        {showNetting && e.rawAvail !== e.avail && <span className="raw-note"> (raw {fmtN(e.rawAvail)})</span>}
      </td>
      <td className="av-note">
        {e.underdelivery && <span className="ud-note">{e.underMonths.join(', ')} </span>}
        {e.odExcess > 0 ? `+${e.odExcess} overdelivery (${e.odMonth} ${fmtPct(e.odPct)})` : ''}
      </td>
    </tr>
  )
}

// ── Reserve box ────────────────────────────────────────────────────────────
function ReserveBox({ zipInfo, desired, reserved, onReserved, sellerName, sellerEmail, verdict, approvalScore, av, dealerMapData }) {
  const [checked, setChecked] = useState(false)
  const [leads, setLeads] = useState(desired || '')
  const [dealer, setDealer] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [error, setError] = useState('')
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false)
  const [bcType, setBcType] = useState('new')          // 'new' | 'upsell'
  const [dealerType, setDealerType] = useState('franchise') // 'franchise' | 'independent'
  const [hasCrm, setHasCrm] = useState(null)           // true | false | null
  const [inventorySize, setInventorySize] = useState('') // '<50'|'50-150'|'150-300'|'300+'

  // Reset all state when zip changes
  useEffect(() => {
    setConfirmed(null)
    setChecked(false)
    setDealer('')
    setNotes('')
    setError('')
    setLeads(desired || '')
    setConfirmingDuplicate(false)
    setBcType('new')
    setDealerType('franchise')
    setHasCrm(null)
    setInventorySize('')
  }, [zipInfo.zip])

  // Reset confirmation when the reservation is released externally (from panel or slideout)
  useEffect(() => {
    if (!confirmed) return
    const stillActive = reserved.some(r => r.id === confirmed.id && r.status === 'active')
    if (!stillActive) {
      setConfirmed(null)
      setChecked(false)
    }
  }, [reserved, confirmed])

  const totalReservedHere = reserved
    .filter(r => r.zip === zipInfo.zip && r.status === 'active')
    .reduce((s,r) => s + r.leadsReserved, 0)

  // Reactive dealer match — recomputes on dealer name, bcType, or dma change
  // Returns { target, svoc } for upsells, or just { svoc } for new BCs
  const dealerMatch = React.useMemo(() => {
    if (!dealer.trim() || !dealerMapData) return null
    const dmaKey = zipInfo.dma?.toUpperCase()
    const entries = dealerMapData[dmaKey] || []
    const dealerLower = dealer.trim().toLowerCase()
    // Search all DMAs if not found in current DMA (dealer may be in adjacent market)
    let match = entries.find(e => {
      if (!e[1]) return false
      const eName = e[1].toLowerCase()
      return eName.includes(dealerLower) || dealerLower.includes(eName) ||
        dealerLower.split(' ').filter(w => w.length > 3).every(w => eName.includes(w))
    })
    // Fallback: search all DMAs
    if (!match) {
      for (const dmaEntries of Object.values(dealerMapData)) {
        match = dmaEntries.find(e => {
          if (!e[1]) return false
          const eName = e[1].toLowerCase()
          return eName.includes(dealerLower) || dealerLower.includes(eName) ||
            dealerLower.split(' ').filter(w => w.length > 3).every(w => eName.includes(w))
        })
        if (match) break
      }
    }
    if (!match) return null
    return {
      target: match[5] || null,   // DAT Target
      svoc: match[7] || null,     // SVOC
      name: match[1] || null,     // Matched dealer name
    }
  }, [dealer, dealerMapData, zipInfo.dma])

  const currentTarget = bcType === 'upsell' ? (dealerMatch?.target || null) : null

  const expires = new Date(Date.now() + 14 * 86400000)

  async function submit() {
    if (!leads || leads < 1) { setError('Enter a valid lead amount.'); return }
    if (!dealer.trim()) { setError('Dealer name is required.'); return }
    setError(''); setLoading(true)
    try {
      // Determine effective verdict — large requests always go to review
      const leadsNum = parseInt(leads)
      // Threshold rules per ICO Ops policy:
      // New BC: >400 needs escalation
      // Upsell: >600 needs escalation (increments of 150 allowed up to 600)
      const threshold = bcType === 'upsell' ? 600 : 400
      const effectiveVerdict = leadsNum > threshold && verdict !== 'DENIED'
        ? 'REVIEW_REQUIRED' : verdict

      // Build score breakdown for email
      const scoreBreakdown = av ? (() => {
        const sc = calcApprovalScore(av, leadsNum,
          Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===zipInfo.dma)+1,
          Object.keys(dmaSaturation).length
        )
        return sc ? [
          {name:'Base Availability', val:sc.f1, max:3},
          {name:'Ring Coverage', val:sc.f2, max:3},
          {name:'Overage Ratio', val:sc.f3, max:2},
          {name:'DMA Health', val:sc.f4, max:1},
          {name:'Delivery Trend', val:sc.f5, max:1},
          {name:'Nearby BC Performance', val:sc.f6 || 0.5, max:1},
        ] : null
      })() : null

      const res = await createReservation({
        zip: zipInfo.zip, city: zipInfo.city, state: zipInfo.state, dma: zipInfo.dma,
        leadsReserved: leadsNum, dealerName: dealer.trim(),
        notes: notes.trim(), reservedBy: sellerName || 'Unknown',
        reservedByEmail: sellerEmail || '',
        verdict: effectiveVerdict, approvalScore: approvalScore || null,
        scoreBreakdown,
        nearbyBCNote: av ? (() => {
          const sc = calcApprovalScore(av, leadsNum,
            Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===zipInfo.dma)+1,
            Object.keys(dmaSaturation).length
          )
          return sc?.nearbyBCDeliveryNote || null
        })() : null,
        bcType,
        dealerType,
        currentDealerTarget: currentTarget || null,
        svoc: dealerMatch?.svoc || null,
        marketTier: getDmaTier(zipInfo.dma),
        tierMinLeads: getTierMinLeads(getDmaTier(zipInfo.dma)),
        hasCrm,
        inventorySize: dealerType === 'independent' ? inventorySize : null,
      })

      // Send to ICO Ops only for real BC verdicts
      const opsVerdicts = ['APPROVED','APPROVABLE','REVIEW_REQUIRED']
      if (opsVerdicts.includes(effectiveVerdict)) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'submit_to_ops', reservation: res, av })
        }).catch(e => console.error('Ops notify failed:', e))
      }

      setConfirmed({ ...res, effectiveVerdict })
      onReserved()
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (confirmed) {
    const v = confirmed.effectiveVerdict || confirmed.verdict
    const vColors = { APPROVED:'#00c896', APPROVABLE:'#f5a800', REVIEW_REQUIRED:'#f97316', DENIED:'#ff4757' }
    const vColor = vColors[v] || 'var(--muted)'
    const sentToOps = v && v !== 'DENIED'
    return (
      <div className="reserve-box">
        <div className="reserve-confirmed">
          <div className="reserve-confirmed-icon">✓</div>
          <div style={{flex:1}}>
            <strong>{fmtN(confirmed.leadsReserved)} leads reserved</strong> for {confirmed.dealerName} in zip {confirmed.zip}
            <br /><span style={{fontSize:12,color:'var(--muted)'}}>Expires {fmtDate(confirmed.expiresAt)} · ID: {confirmed.id.slice(-8)}</span>
          </div>
          <button className="res-cancel-btn" style={{marginLeft:16,flexShrink:0}}
            onClick={async () => {
              await cancelReservation(confirmed.id)
              setConfirmed(null); setChecked(false); onReserved()
            }}>Release</button>
        </div>
        {v && (
          <div style={{marginTop:10,padding:'10px 14px',background: vColor+'10',border:`1px solid ${vColor}30`,borderRadius:7}}>
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
              <span style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:11,letterSpacing:1,color:vColor}}>{v.replace('_',' ')}</span>
              {sentToOps && <span style={{fontSize:11,color:'var(--muted)'}}>· Sent to ICO Ops · Timer started</span>}
            </div>
            <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
              {v === 'APPROVED' && 'Auto-approved based on availability. ICO Ops has been notified. Proceed with generating the agreement in CPQ.'}
              {v === 'APPROVABLE' && "Sent to ICO Ops for review. You'll receive an email notification when they respond."}
              {v === 'REVIEW_REQUIRED' && "Sent to ICO Ops for manual review. You'll receive an email notification when they respond."}
              {v === 'DENIED' && 'Reservation created but availability is insufficient. Not submitted to ICO Ops.'}
            </div>
          </div>
        )}
      </div>
    )
  }

  // Get existing active reservations for this zip with full details
  const existingReservations = reserved.filter(r => r.zip === zipInfo.zip && r.status === 'active')

  return (
    <div className="reserve-box">
      <div className="reserve-title">Reserve Leads</div>

      {existingReservations.length > 0 && (
        <div className="reserve-existing-detail">
          <div className="reserve-existing-title">⚠ Existing reservations in this zip:</div>
          {existingReservations.map(r => (
            <div key={r.id} className="reserve-existing-row">
              <span className="reserve-existing-dealer">{r.dealerName}</span>
              <span className="reserve-existing-leads">{fmtN(r.leadsReserved)} leads</span>
              <span className="reserve-existing-by">by {r.reservedBy}</span>
              <span className="reserve-existing-exp">exp {fmtDate(r.expiresAt)}</span>
            </div>
          ))}
          <div style={{fontSize:11,color:'#92400e',marginTop:6}}>
            Total already reserved: <strong>{fmtN(totalReservedHere)} leads</strong>
          </div>
        </div>
      )}

      <label className="reserve-check-label">
        <input type="checkbox" checked={checked} onChange={e => { setChecked(e.target.checked); setConfirmingDuplicate(false) }} />
        Reserve {desired ? fmtN(desired) : ''} leads for this zip
      </label>

      {checked && (() => {
        const leadsNum = parseInt(leads) || 0
        const threshold = bcType === 'upsell' ? 600 : 400
        const overThreshold = leadsNum > threshold
        return (
        <div style={{marginTop:12}}>

          {/* Row 1: Dealer Name */}
          <div className="reserve-field">
            <label className="reserve-field-label">Dealer Name *</label>
            <input className="reserve-input" value={dealer} onChange={e=>setDealer(e.target.value)} placeholder="e.g. World Car Nissan" />
          </div>

          {/* Row 2: Type / Dealer Type / CRM all uniform */}
          <div className="reserve-qual-row" style={{marginTop:8}}>
            <div className="reserve-field">
              <label className="reserve-field-label">BC Type</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${bcType==='new'?'active':''}`} onClick={()=>setBcType('new')}>New BC</button>
                <button className={`reserve-toggle reserve-toggle-half ${bcType==='upsell'?'active':''}`} onClick={()=>setBcType('upsell')}>Upsell</button>
              </div>
            </div>
            <div className="reserve-field">
              <label className="reserve-field-label">Dealer Type</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${dealerType==='franchise'?'active':''}`} onClick={()=>setDealerType('franchise')}>Franchise</button>
                <button className={`reserve-toggle reserve-toggle-half ${dealerType==='independent'?'active':''}`} onClick={()=>setDealerType('independent')}>Independent</button>
              </div>
            </div>
            <div className="reserve-field">
              <label className="reserve-field-label">Has CRM?</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${hasCrm===true?'active':''}`} onClick={()=>setHasCrm(true)}>Yes</button>
                <button className={`reserve-toggle reserve-toggle-half ${hasCrm===false?'active':''}`} onClick={()=>setHasCrm(false)}>No</button>
              </div>
            </div>
            {dealerType === 'independent' && (
              <div className="reserve-field">
                <label className="reserve-field-label">Vehicle Inventory</label>
                <select className="reserve-input" value={inventorySize} onChange={e=>setInventorySize(e.target.value)}>
                  <option value="">Select size</option>
                  <option value="<50">&lt;50 vehicles</option>
                  <option value="50-150">50–150 vehicles</option>
                  <option value="150-300">150–300 vehicles</option>
                  <option value="300+">300+ vehicles</option>
                </select>
              </div>
            )}
          </div>

          {/* Independent < 50 warning */}
          {dealerType === 'independent' && inventorySize === '<50' && (
            <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:6,padding:'8px 12px',marginTop:6,fontSize:12,color:'#92400e'}}>
              ⚠ Independent dealers need 50+ vehicles listed. ICO Ops exception requires Performance Management approval.
            </div>
          )}

          {/* Upsell context */}
          {bcType === 'upsell' && currentTarget && (
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'8px 12px',marginTop:6,fontSize:12,color:'#1e40af'}}>
              Current target: <strong>{fmtN(currentTarget)} leads/mo</strong> — requesting {fmtN(leadsNum)} more = <strong>{fmtN(currentTarget + leadsNum)} total</strong>
              {currentTarget + leadsNum > 600 && <span style={{color:'var(--red)',fontWeight:700}}> · Exceeds 600 — escalation required</span>}
            </div>
          )}

          {/* Row 4: Lead Amount */}
          <div className="reserve-field" style={{marginTop:8,maxWidth:160}}>
            <label className="reserve-field-label">Lead Amount * <span style={{fontWeight:400,color:'var(--muted)'}}>({bcType==='upsell'?'max 600':'max 400'} without escalation)</span></label>
            <input className="reserve-input" type="number" value={leads} onChange={e=>setLeads(e.target.value)} min={1} placeholder="200" />
            {overThreshold && (
              <div style={{marginTop:4,fontSize:11,color:'#c2410c',fontWeight:600}}>
                ⚠ Over {threshold} leads — this will be flagged as REVIEW REQUIRED for ICO Ops escalation
              </div>
            )}
          </div>

          {/* Row 5: Notes */}
          <div className="reserve-field" style={{marginTop:8}}>
            <label className="reserve-field-label">Notes (optional)</label>
            <input className="reserve-input" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. New install, pending approval" />
          </div>

          <div className="reserve-expiry-note">
            Reservation expires in 14 days — <strong>{expires.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</strong>
          </div>

          {existingReservations.length > 0 && !confirmingDuplicate && (
            <div className="reserve-duplicate-warning">
              <strong>This zip already has {fmtN(totalReservedHere)} leads reserved.</strong> Are you sure you want to add another reservation for a different dealer?
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button className="reserve-submit-btn" style={{background:'#c8860a'}} onClick={() => setConfirmingDuplicate(true)}>Yes, add another reservation</button>
                <button className="reserve-submit-btn" style={{background:'var(--bg)',color:'var(--text)',border:'1px solid var(--border)'}} onClick={() => { setChecked(false); setConfirmingDuplicate(false) }}>Cancel</button>
              </div>
            </div>
          )}

          {(existingReservations.length === 0 || confirmingDuplicate) && (
            <>
              {error && <div style={{color:'var(--red)',fontSize:12,marginBottom:8}}>{error}</div>}
              <button className="reserve-submit-btn" onClick={submit} disabled={loading || hasCrm === null || (dealerType === 'independent' && !inventorySize)}>
                {loading ? 'Saving…' : 'Confirm Reservation'}
              </button>
              {(hasCrm === null || (dealerType === 'independent' && !inventorySize)) && (
                <div style={{fontSize:11,color:'var(--muted)',marginTop:4}}>
                  {hasCrm === null ? 'Please indicate whether dealer has a CRM' : 'Please select vehicle inventory size'}
                </div>
              )}
            </>
          )}
        </div>
        )
      })()}
    </div>
  )
}



// ── Edit Reservation Modal ─────────────────────────────────────────────────
function EditReservationModal({ reservation, onSave, onClose, dealerMapData, av, sellerName, sellerEmail }) {
  const r = reservation
  const [dealer, setDealer] = useState(r.dealerName || '')
  const [leads, setLeads] = useState(String(r.leadsReserved || ''))
  const [notes, setNotes] = useState(r.notes || '')
  const [bcType, setBcType] = useState(r.bcType || 'new')
  const [dealerType, setDealerType] = useState(r.dealerType || 'franchise')
  const [hasCrm, setHasCrm] = useState(r.hasCrm !== undefined ? r.hasCrm : null)
  const [inventorySize, setInventorySize] = useState(r.inventorySize || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Reactive dealer match for upsell target + SVOC
  const dealerMatch = React.useMemo(() => {
    if (!dealer.trim() || !dealerMapData) return null
    const dmaKey = r.dma?.toUpperCase()
    const entries = dealerMapData[dmaKey] || []
    const dealerLower = dealer.trim().toLowerCase()
    let match = entries.find(e => {
      if (!e[1]) return false
      const eName = e[1].toLowerCase()
      return eName.includes(dealerLower) || dealerLower.includes(eName) ||
        dealerLower.split(' ').filter(w => w.length > 3).every(w => eName.includes(w))
    })
    if (!match) {
      for (const dmaEntries of Object.values(dealerMapData)) {
        match = dmaEntries.find(e => {
          if (!e[1]) return false
          const eName = e[1].toLowerCase()
          return eName.includes(dealerLower) || dealerLower.includes(eName) ||
            dealerLower.split(' ').filter(w => w.length > 3).every(w => eName.includes(w))
        })
        if (match) break
      }
    }
    if (!match) return null
    return { target: match[5] || null, svoc: match[7] || null, name: match[1] || null }
  }, [dealer, dealerMapData, r.dma])

  const currentTarget = bcType === 'upsell' ? (dealerMatch?.target || null) : null

  async function save() {
    if (!dealer.trim()) { setError('Dealer name is required.'); return }
    if (!leads || parseInt(leads) < 1) { setError('Enter a valid lead amount.'); return }
    if (hasCrm === null) { setError('Please indicate whether dealer has a CRM.'); return }
    setError(''); setLoading(true)

    try {
      const leadsNum = parseInt(leads)
      const threshold = bcType === 'upsell' ? 600 : 400

      // Recompute verdict based on new values
      const baseVerdict = r.verdict === 'DENIED' ? 'DENIED' : r.verdict
      const newVerdict = leadsNum > threshold && baseVerdict !== 'DENIED'
        ? 'REVIEW_REQUIRED' : baseVerdict

      const updated = await updateReservation(r.id, {
        dealerName: dealer.trim(),
        leadsReserved: leadsNum,
        notes: notes.trim(),
        bcType, dealerType, hasCrm,
        inventorySize: dealerType === 'independent' ? inventorySize : null,
        currentDealerTarget: currentTarget || null,
        svoc: dealerMatch?.svoc || r.svoc || null,
        verdict: newVerdict,
        marketTier: r.marketTier,
        tierMinLeads: r.tierMinLeads,
        approvalScore: r.approvalScore,
        scoreBreakdown: r.scoreBreakdown,
        nearbyBCNote: r.nearbyBCNote,
      })

      // Re-notify ops if verdict-relevant fields changed
      const changed = dealer.trim() !== r.dealerName || leadsNum !== r.leadsReserved || bcType !== r.bcType
      if (changed && ['APPROVED','APPROVABLE','REVIEW_REQUIRED'].includes(newVerdict)) {
        fetch('/api/notify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'submit_to_ops',
            reservation: { ...updated, reservedBy: sellerName, reservedByEmail: sellerEmail },
            av
          })
        }).catch(e => console.error('Re-notify failed:', e))
      }

      onSave(updated)
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  const leadsNum = parseInt(leads) || 0
  const threshold = bcType === 'upsell' ? 600 : 400
  const overThreshold = leadsNum > threshold

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{maxWidth:540}}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Edit Reservation</div>
            <div className="modal-sub">{r.zip} · {r.city}, {r.state} · {r.dma}</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{padding:'20px 24px',display:'flex',flexDirection:'column',gap:12}}>
          {/* Dealer Name */}
          <div className="reserve-field">
            <label className="reserve-field-label">Dealer Name *</label>
            <input className="reserve-input" value={dealer} onChange={e => setDealer(e.target.value)} />
          </div>

          {/* BC Type / Dealer Type / CRM row */}
          <div className="reserve-qual-row">
            <div className="reserve-field">
              <label className="reserve-field-label">BC Type</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${bcType==='new'?'active':''}`} onClick={()=>setBcType('new')}>New BC</button>
                <button className={`reserve-toggle reserve-toggle-half ${bcType==='upsell'?'active':''}`} onClick={()=>setBcType('upsell')}>Upsell</button>
              </div>
            </div>
            <div className="reserve-field">
              <label className="reserve-field-label">Dealer Type</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${dealerType==='franchise'?'active':''}`} onClick={()=>setDealerType('franchise')}>Franchise</button>
                <button className={`reserve-toggle reserve-toggle-half ${dealerType==='independent'?'active':''}`} onClick={()=>setDealerType('independent')}>Independent</button>
              </div>
            </div>
            <div className="reserve-field">
              <label className="reserve-field-label">Has CRM?</label>
              <div className="reserve-toggle-group">
                <button className={`reserve-toggle reserve-toggle-half ${hasCrm===true?'active':''}`} onClick={()=>setHasCrm(true)}>Yes</button>
                <button className={`reserve-toggle reserve-toggle-half ${hasCrm===false?'active':''}`} onClick={()=>setHasCrm(false)}>No</button>
              </div>
            </div>
            {dealerType === 'independent' && (
              <div className="reserve-field">
                <label className="reserve-field-label">Vehicle Inventory</label>
                <select className="reserve-input" value={inventorySize} onChange={e=>setInventorySize(e.target.value)}>
                  <option value="">Select size</option>
                  <option value="<50">&lt;50 vehicles</option>
                  <option value="50-150">50–150 vehicles</option>
                  <option value="150-300">150–300 vehicles</option>
                  <option value="300+">300+ vehicles</option>
                </select>
              </div>
            )}
          </div>

          {/* Upsell context */}
          {bcType === 'upsell' && currentTarget && (
            <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,padding:'8px 12px',fontSize:12,color:'#1e40af'}}>
              Current target: <strong>{fmtN(currentTarget)} leads/mo</strong> — requesting {fmtN(leadsNum)} more = <strong>{fmtN(currentTarget + leadsNum)} total</strong>
              {currentTarget + leadsNum > 600 && <span style={{color:'var(--red)',fontWeight:700}}> · Exceeds 600 — escalation required</span>}
            </div>
          )}

          {/* Lead Amount */}
          <div className="reserve-field" style={{maxWidth:200}}>
            <label className="reserve-field-label">
              Lead Amount * <span style={{fontWeight:400,color:'var(--muted)'}}>({bcType==='upsell'?'max 600':'max 400'} without escalation)</span>
            </label>
            <input className="reserve-input" type="number" value={leads} onChange={e=>setLeads(e.target.value)} min={1} />
            {overThreshold && (
              <div style={{marginTop:4,fontSize:11,color:'#c2410c',fontWeight:600}}>
                ⚠ Over {threshold} — will be flagged as REVIEW REQUIRED
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="reserve-field">
            <label className="reserve-field-label">Notes (optional)</label>
            <input className="reserve-input" value={notes} onChange={e=>setNotes(e.target.value)} />
          </div>

          {/* Re-notify warning */}
          <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:6,padding:'8px 12px',fontSize:12,color:'#92400e'}}>
            ⚠ Changing the dealer name or lead amount will re-notify ICO Ops with an updated email.
          </div>

          {error && <div style={{color:'var(--red)',fontSize:12}}>{error}</div>}

          <div style={{display:'flex',gap:8,justifyContent:'flex-end',paddingTop:4}}>
            <button className="res-cancel-btn" onClick={onClose}>Cancel</button>
            <button className="reserve-submit-btn" style={{margin:0}} onClick={save} disabled={loading}>
              {loading ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Reservation Slideout — DMA filtered view ─────────────────────────────
function ReservationSlideout({ reservations, onCancel, onClose, onRefresh, onEdit, sellerName }) {
  const active = reservations.filter(r => r.status === 'active')
  const expired = reservations.filter(r => r.status === 'expired')

  // Build DMA list from active reservations
  const dmas = ['All DMAs', ...Array.from(new Set(active.map(r => r.dma).filter(Boolean))).sort()]
  const [selectedDMA, setSelectedDMA] = useState('All DMAs')

  const filtered = selectedDMA === 'All DMAs'
    ? active
    : active.filter(r => r.dma === selectedDMA)

  // Summary stats for selected DMA
  const totalLeads = filtered.reduce((s, r) => s + r.leadsReserved, 0)
  const bySeller = filtered.reduce((acc, r) => {
    acc[r.reservedBy] = (acc[r.reservedBy] || 0) + r.leadsReserved
    return acc
  }, {})

  return (
    <div className="slideout-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slideout-panel">
        <div className="slideout-header">
          <div>
            <div className="slideout-title">Active Reservations</div>
            <div className="slideout-sub">{active.length} active across {dmas.length - 1} DMA{dmas.length > 2 ? 's' : ''}</div>
          </div>
          <div style={{display:'flex',gap:8,alignItems:'center'}}>
            <button className="res-action-btn" onClick={onRefresh}>↻ Refresh</button>
            <button className="slideout-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* DMA Filter */}
        <div className="slideout-dma-filter">
          <div className="slideout-filter-label">Filter by DMA</div>
          <div className="slideout-dma-pills">
            {dmas.map(dma => (
              <button
                key={dma}
                className={`dma-pill ${selectedDMA === dma ? 'dma-pill-active' : ''}`}
                onClick={() => setSelectedDMA(dma)}
              >
                {dma}
                {dma !== 'All DMAs' && (
                  <span className="dma-pill-count">
                    {active.filter(r => r.dma === dma).length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Summary strip */}
        {filtered.length > 0 && (
          <div className="slideout-summary">
            <div className="slideout-summary-stat">
              <div className="slideout-summary-val">{filtered.length}</div>
              <div className="slideout-summary-label">reservations</div>
            </div>
            <div className="slideout-summary-stat">
              <div className="slideout-summary-val">{fmtN(totalLeads)}</div>
              <div className="slideout-summary-label">leads reserved</div>
            </div>
            <div className="slideout-summary-sellers">
              {Object.entries(bySeller).sort((a,b) => b[1]-a[1]).map(([seller, leads]) => (
                <span key={seller} className="res-seller-chip">{seller}: {fmtN(leads)}</span>
              ))}
            </div>
          </div>
        )}

        {/* Reservation list */}
        <div className="slideout-body">
          {filtered.length === 0 ? (
            <div className="slideout-empty">No active reservations{selectedDMA !== 'All DMAs' ? ` in ${selectedDMA}` : ''}.</div>
          ) : (
            <table className="dealer-table slideout-table">
              <thead>
                <tr>
                  <th>Zip</th><th>Location</th><th className="th-r">Leads</th>
                  <th>Dealer</th><th>Notes</th><th>Reserved By</th>
                  <th>Expires</th><th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const days = daysUntil(r.expiresAt)
                  const urgency = days <= 3 ? 'res-urgent' : days <= 7 ? 'res-warn' : ''
                  return (
                    <tr key={r.id}>
                      <td className="td-mono">{r.zip}</td>
                      <td>{r.city}, {r.state}</td>
                      <td className="td-right td-num"><strong>{fmtN(r.leadsReserved)}</strong></td>
                      <td>{r.dealerName || '—'}</td>
                      <td className="td-dim" style={{fontSize:11}}>{r.notes || '—'}</td>
                      <td className="td-dim">{r.reservedBy || '—'}</td>
                      <td className={urgency}>
                        {fmtDate(r.expiresAt)}
                        {days <= 7 && <span className="res-days"> ({days}d)</span>}
                      </td>
                      <td>
                        <div style={{display:'flex',gap:4}}>
                          {onEdit && sellerName && r.reservedBy === sellerName && (
                            <button className="res-edit-btn" onClick={() => onEdit(r)}>Edit</button>
                          )}
                          <button className="res-cancel-btn" onClick={() => onCancel(r.id)}>
                            Release
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}

          {expired.length > 0 && (
            <div style={{marginTop:16}}>
              <div style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:10,letterSpacing:'1px',textTransform:'uppercase',color:'var(--muted)',marginBottom:8}}>
                Expired ({expired.length})
              </div>
              <table className="dealer-table slideout-table">
                <thead><tr><th>Zip</th><th>Location</th><th className="th-r">Leads</th><th>Dealer</th><th>Reserved By</th><th>Expired</th></tr></thead>
                <tbody>
                  {expired.map(r => (
                    <tr key={r.id} className="res-inactive">
                      <td className="td-mono">{r.zip}</td>
                      <td>{r.city}, {r.state}</td>
                      <td className="td-right td-num">{fmtN(r.leadsReserved)}</td>
                      <td>{r.dealerName || '—'}</td>
                      <td className="td-dim">{r.reservedBy || '—'}</td>
                      <td className="td-dim">{fmtDate(r.expiresAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Reservations panel ─────────────────────────────────────────────────────
function ReservationsPanel({ reservations, onCancel, onRefresh, onEdit, currentUser }) {
  const active = reservations.filter(r => r.status === 'active')
  const expired = reservations.filter(r => r.status === 'expired')
  if (reservations.length === 0) return null

  return (
    <div className="res-panel">
      <div className="res-panel-header">
        <div className="res-panel-title">Active Reservations ({active.length})</div>
          {active.length > 0 && (() => {
            const bySeller = {}
            active.forEach(r => { bySeller[r.reservedBy] = (bySeller[r.reservedBy] || 0) + r.leadsReserved })
            return (
              <div className="res-seller-summary">
                {Object.entries(bySeller).sort((a,b)=>b[1]-a[1]).map(([seller, leads]) => (
                  <span key={seller} className="res-seller-chip">{seller}: {fmtN(leads)} leads</span>
                ))}
              </div>
            )
          })()}
        <div className="res-panel-actions">
          <button className="res-action-btn" onClick={onRefresh}>↻ Refresh</button>
        </div>
      </div>
      <div className="table-wrap">
        <table className="dealer-table">
          <thead>
            <tr>
              <th>Zip</th><th>Location</th><th className="th-r">Leads</th>
              <th>Dealer</th><th>Notes</th><th>Reserved By</th>
              <th>Ops Status</th><th>Reserved</th><th>Expires</th><th></th>
            </tr>
          </thead>
          <tbody>
            {active.map(r => <ReservationRow key={r.id} r={r} onCancel={onCancel} onEdit={onEdit} currentUser={currentUser} />)}
            {expired.length > 0 && (
              <tr className="av-section"><td colSpan={10}>Expired ({expired.length})</td></tr>
            )}
            {expired.map(r => <ReservationRow key={r.id} r={r} onCancel={null} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReservationRow({ r, onCancel, onEdit, currentUser }) {
  const days = daysUntil(r.expiresAt)
  const urgency = r.status === 'active' ? (days <= 3 ? 'res-urgent' : days <= 7 ? 'res-warn' : '') : ''
  return (
    <tr className={r.status !== 'active' ? 'res-inactive' : ''}>
      <td className="td-mono">{r.zip}</td>
      <td>{r.city}, {r.state}</td>
      <td className="td-num" style={{textAlign:'right'}}><strong>{fmtN(r.leadsReserved)}</strong></td>
      <td>{r.dealerName || '—'}</td>
      <td className="td-dim">{r.notes || '—'}</td>
      <td className="td-dim">{r.reservedBy || '—'}</td>
      <td>
        {r.status === 'activated' ? (
          <span style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:10,letterSpacing:.5,
            padding:'2px 7px',borderRadius:4,background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe'}}>
            ACTIVATED
          </span>
        ) : r.opsStatus && r.opsStatus !== 'DENIED' ? (
          <span style={{
            fontFamily:'var(--cond)', fontWeight:700, fontSize:10, letterSpacing:.5,
            padding:'2px 7px', borderRadius:4,
            background: r.opsStatus === 'APPROVED' ? '#f0fdf4' : r.opsStatus === 'PENDING' ? '#fffbeb' : '#fff0f0',
            color: r.opsStatus === 'APPROVED' ? '#15803d' : r.opsStatus === 'PENDING' ? '#92400e' : '#b91c1c',
            border: `1px solid ${r.opsStatus === 'APPROVED' ? '#86efac' : r.opsStatus === 'PENDING' ? '#fde68a' : '#fca5a5'}`
          }}>{r.opsStatus}</span>
        ) : <span className="td-dim">—</span>}
      </td>
      <td className="td-mono td-dim">{r.createdAt ? fmtDate(r.createdAt) : "—"}</td>
      <td className={urgency}>
        {r.status === 'active'
          ? <>{fmtDate(r.expiresAt)}{days <= 7 && <span className="res-days"> ({days}d)</span>}</>
          : <span className={`res-status-${r.status}`}>{r.status.toUpperCase()}</span>
        }
      </td>
      <td>
        <div style={{display:'flex',gap:4}}>
          {onEdit && r.status === 'active' && currentUser && r.reservedBy === currentUser && (
            <button className="res-edit-btn" onClick={() => onEdit(r)}>Edit</button>
          )}
          {onCancel && r.status === 'active' && (
            <button className="res-cancel-btn" onClick={() => onCancel(r.id)}>Release</button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Dealer table ───────────────────────────────────────────────────────────
function DealerTable({ dma, searchZip, liveDealerMap }) {
  const cm = coordsMap
  const activeDealerMap = liveDealerMap || dealerMap
  const dealers = activeDealerMap[dma] || []
  if (!dealers.length) return null

  const sc = cm[searchZip]
  // haversine imported from utils

  const withDist = dealers.map(d => ({
    d,
    dist: (sc && d[8] !== null && d[9] !== null) ? haversine(sc[0], sc[1], d[8], d[9]) : null
  })).sort((a,b) => {
    if (a.dist === null && b.dist === null) return 0
    if (a.dist === null) return 1
    if (b.dist === null) return -1
    return a.dist - b.dist
  })

  const totalTarget = dealers.reduce((s,d) => s + (d[5]||0), 0)
  const totalAvail  = dealers.reduce((s,d) => s + (d[6]||0), 0)
  const months = ["Dec '25","Jan '26","Feb '26","Mar '26"]

  return (
    <div className="dealer-section">
      <div className="section-header">
        <div className="section-title">Active Buying Centers — {dma} DMA</div>
        <div className="section-meta">{dealers.length} dealers · {fmtN(totalTarget)} leads/mo allocated · {fmtN(totalAvail)} net available · sorted nearest first</div>
      </div>
      <div className="table-wrap">
        <table className="dealer-table">
          <thead>
            <tr className="thead-top">
              <th colSpan={11}></th>
              <th colSpan={4} className="th-month-group">Total Leads &amp; % of Target</th>
            </tr>
            <tr>
              <th></th><th>Dist</th><th>Zip</th><th>Dealer</th><th>SVOC</th>
              <th className="th-r">Tenure</th><th className="th-r">Rate</th>
              <th className="th-r">Mkt Rate</th><th className="th-r">DAT Target</th>
              <th className="th-r">Available</th>
              <th className="th-r" title="Delivery trend Dec→Feb">Trend</th>
              {months.map(m => <th key={m} className="th-month">{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {withDist.map(({ d, dist }) => {
              const isCur = d[0] === searchZip
              const aClass = d[6] === null ? '' : d[6] > 0 ? 'avail-pos' : 'avail-neg'
              const dot = d[6] !== null && d[6] > 0 ? 'dot-green' : 'dot-red'
              const leads = d[11] || [null,null,null,null]
              const pct   = d[12] || [null,null,null,null]
              return (
                <tr key={d[0]+d[7]} className={isCur ? 'current-row' : ''}>
                  <td><span className={`status-dot ${dot}`}></span></td>
                  <td className="td-dist">{dist !== null ? dist.toFixed(1)+' mi' : '—'}</td>
                  <td className="td-mono">
                    {d[0]}{isCur && <span className="current-tag">this zip</span>}
                  </td>
                  <td className="td-dealer">
                    <div className="dealer-name">{d[1]}</div>
                    {d[2] && <div className="dealer-group">{d[2]}</div>}
                  </td>
                  <td className="td-mono td-dim">{d[7]}</td>
                  <td className="td-right td-dim">{d[10] !== null ? d[10]+' mo' : '—'}</td>
                  <td className="td-right">{d[3]}</td>
                  <td className="td-right td-dim">{d[4]}</td>
                  <td className="td-right td-num">{fmtN(d[5])}</td>
                  <td className={`td-right td-num ${aClass}`}>{fmtN(d[6])}</td>
                  <td className="td-trend">{(() => {
                    const p = d[12] || [null,null,null,null]
                    // Use Dec(0), Jan(1), Feb(2) — skip Mar(3) partial
                    const vals = [p[0], p[1], p[2]].filter(v => v !== null)
                    if (vals.length < 2) return <span className="trend-na">—</span>
                    const first = vals[0], last = vals[vals.length-1]
                    const diff = last - first
                    if (diff > 0.05)  return <span className="trend-up">↑</span>
                    if (diff < -0.05) return <span className="trend-down">↓</span>
                    return <span className="trend-flat">→</span>
                  })()}</td>
                  {leads.map((l, i) => (
                    <td key={i} className="td-month">
                      {l !== null
                        ? <><div className="month-leads">{fmtN(l)}</div><div className={`month-pct ${pctClass(pct[i])}`}>{fmtPct(pct[i])}</div></>
                        : <span className="td-dim">—</span>}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={9} className="tf-label">DMA TOTALS</td>
              <td className="td-right td-num tf-val">{fmtN(totalTarget)}</td>
              <td className={`td-right td-num tf-val ${totalAvail > 0 ? 'avail-pos' : 'avail-neg'}`}>{fmtN(totalAvail)}</td>
              <td colSpan={4}></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

// ── Update Data modal ──────────────────────────────────────────────────────
function UpdateModal({ onClose, onDataUpdated }) {
  const [msgs, setMsgs] = useState({})
  const [uploading, setUploading] = useState({})

  function setMsg(k, m, t) { setMsgs(p => ({...p, [k]: {m, t}})) }

  async function handleFile(ft, file) {
    if (!file) return
    setUploading(p => ({...p, [ft]: true}))
    setMsg(ft, 'Reading file…', 'info')

    try {
      // Read file as ArrayBuffer for client-side parsing
      const arrayBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsArrayBuffer(file)
      })

      setMsg(ft, 'Parsing file…', 'info')

      // Parse xlsx client-side using the xlsx library
      const XLSX = await import('xlsx')
      const wb = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

      setMsg(ft, 'Processing…', 'info')

      setMsg(ft, 'Uploading…', 'info')

      // For dealer export: build dealerMap client-side then send in chunks
      // (Vercel body limit ~1MB; full dealerMap ~383KB but JSON overhead pushes over)
      if (ft === 'dealer') {
        const hdrs = rows[0] ? rows[0].map(h => h ? String(h).toLowerCase().trim() : '') : []
        const fc = (exact, fallback) => { const i = hdrs.findIndex(h => h === exact); return i >= 0 ? i : fallback }
        const zipIdx=fc('dealer zip',8), nameIdx=fc('dealer',3), groupIdx=fc('group',2)
        const dmaIdx=fc('dealer dma',10), rateIdx=fc('rate',5), mktIdx=fc('market rates',6)
        const targetIdx=fc('dat target',7), availIdx=fc('available leads',9), svocIdx=fc('svoc',0)
        const pn = v => { try { return (v!=null&&v!=='')?parseInt(String(v).replace(/[^0-9-]/g,''))||null:null } catch { return null } }
        const dealerMap = {}
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i]
          if (!row[zipIdx] && row[zipIdx] !== 0) continue
          let z; try { z = String(parseInt(String(row[zipIdx]).replace(/[^0-9]/g,''))).padStart(5,'0') } catch { continue }
          if (z.length !== 5 || z === '00000') continue
          const dma = row[dmaIdx] ? String(row[dmaIdx]).trim().toUpperCase() : 'UNKNOWN'
          if (!dealerMap[dma]) dealerMap[dma] = []
          dealerMap[dma].push([z, row[nameIdx]?String(row[nameIdx]).trim():'',
            row[groupIdx]?String(row[groupIdx]).trim():'', row[rateIdx]?String(row[rateIdx]).trim():'',
            row[mktIdx]?String(row[mktIdx]).trim():'', pn(row[targetIdx]), pn(row[availIdx]),
            row[svocIdx]?String(row[svocIdx]).trim():'', null,null,null,null,null])
        }

        // Split into chunks of 40 DMAs (~160KB max per chunk)
        const dmaKeys = Object.keys(dealerMap)
        const chunkSize = 10
        const totalChunks = Math.ceil(dmaKeys.length / chunkSize)
        for (let ci = 0; ci < totalChunks; ci++) {
          const chunkKeys = dmaKeys.slice(ci * chunkSize, (ci + 1) * chunkSize)
          const chunkMap = {}
          chunkKeys.forEach(k => { chunkMap[k] = dealerMap[k] })
          setMsg(ft, `Uploading chunk ${ci + 1}/${totalChunks}…`, 'info')
          const chunkRes = await fetch('/api/upload', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ dealerMap: chunkMap, fileType: 'dealer', fileName: file.name, chunkIndex: ci, totalChunks })
          })
          if (!chunkRes.ok) {
            const err = await chunkRes.json().catch(() => ({ error: 'Server error' }))
            throw new Error(err.error || `Chunk ${ci + 1} failed`)
          }
        }
        // Return last chunk result for success message
        const finalRes = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealerMap: {}, fileType: 'dealer_finalize', fileName: file.name, totalDmas: dmaKeys.length, totalDealers: Object.values(dealerMap).flat().length, totalChunks })
        })
        const result = await finalRes.json()
        if (!finalRes.ok) throw new Error(result.error || 'Finalize failed')
        setMsg(ft, `✓ ${(result.dealers || 0).toLocaleString()} dealers across ${result.dmas || result.totalDmas || 0} DMAs loaded — data date updated to ${result.date}`, 'success')
        setUploading(p => ({...p, [ft]: false}))
        return
      }

      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, fileType: ft, fileName: file.name })
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Server error' }))
        throw new Error(err.error || 'Upload failed')
      }

      const result = await res.json()

      if (ft === 'mat') {
        setMsg(ft, `✓ ${result.zips.toLocaleString()} zips loaded from ${file.name} — data date updated to ${result.date}`, 'success')
        // Fetch the new live data immediately so the app updates without refresh
        const matRes = await fetch('/api/matdata?type=mat')
        if (matRes.ok) {
          const { matMap: liveMat, meta } = await matRes.json()
          onDataUpdated(result.date, liveMat)
        } else {
          onDataUpdated(result.date, null)
        }
      } else if (ft === 'dealer') {
        setMsg(ft, `✓ ${(result.dealers || 0).toLocaleString()} dealers across ${result.dmas || result.totalDmas || 0} DMAs loaded — data date updated to ${result.date}`, 'success')
        const dealerRes = await fetch('/api/matdata?type=dealer')
        if (dealerRes.ok) {
          const { dealerMap: liveDealer } = await dealerRes.json()
          onDataUpdated(result.date, null, liveDealer)
        } else {
          onDataUpdated(result.date, null, null)
        }
      } else if (ft === 'dealerList') {
        setMsg(ft, `✓ ${result.zips.toLocaleString()} zip performance records loaded — data date updated to ${result.date}`, 'success')
        onDataUpdated(result.date, null, null)
      }
    } catch(e) {
      setMsg(ft, `✗ Error: ${e.message}`, 'error')
    }
    setUploading(p => ({...p, [ft]: false}))
  }

  const files = [
    { key: 'mat', label: 'Opportunity Finder OLR', freq: 'Daily', desc: 'Updates all availability numbers across all 40,651 zips' },
    { key: 'dealer', label: 'Dealer Export', freq: 'As needed', desc: 'Updates active buying center list and dealer details' },
    { key: 'dealerList', label: 'Dealer List (Performance)', freq: 'Monthly', desc: 'Updates Dec/Jan/Feb/Mar delivery data and trend arrows' },
  ]

  return (
    <div className="import-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="import-modal">
        <div className="import-modal-header">
          <div className="import-modal-title">↑ Update Data</div>
          <button className="import-close-btn" onClick={onClose}>✕</button>
        </div>
        <div style={{fontSize:13,color:'var(--muted)',marginBottom:20,lineHeight:1.5}}>
          Upload updated source files below. Data processes instantly — no redeploy needed. All sellers will see updated numbers immediately after upload.
        </div>

        {files.map(f => (
          <div key={f.key} className="import-file-section">
            <div className="import-file-header">
              <div>
                <div className="import-file-label">{f.label}</div>
                <div className="import-file-desc">{f.desc}</div>
              </div>
              <div className="import-file-freq">{f.freq}</div>
            </div>
            <div className="import-file-row">
              <label className="imp-btn">
                {uploading[f.key] ? 'Processing…' : 'Choose File'}
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  style={{display:'none'}}
                  disabled={uploading[f.key]}
                  onChange={e => { if (e.target.files[0]) handleFile(f.key, e.target.files[0]) }}
                />
              </label>
              {msgs[f.key] && (
                <div className={`import-msg import-msg-${msgs[f.key].t}`}>
                  {msgs[f.key].m}
                </div>
              )}
            </div>
          </div>
        ))}

        <div className="import-modal-footer">
          <div style={{fontSize:11,color:'var(--muted)'}}>
            Files are processed server-side and stored securely. Data is shared across all sellers instantly.
          </div>
          <button className="import-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}


export default function App() {
  // Initialize from URL params (used by email links)
  const urlParams = new URLSearchParams(window.location.search)
  const [zip, setZip] = useState(urlParams.get('zip') || '')
  const [desired, setDesired] = useState(urlParams.get('leads') || '')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [reservations, setReservations] = useState([])
  const [resLoading, setResLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [sellerName, setSellerName] = useState(() => localStorage.getItem('ico_seller_name') || '')
  const [recentZips, setRecentZips] = useState(() => {
    try { return JSON.parse(localStorage.getItem('ico_recent_zips') || '[]') } catch { return [] }
  })
  const [showMarkets, setShowMarkets] = useState(false)
  const [showResSlideout, setShowResSlideout] = useState(false)
  const [showOpsPanel, setShowOpsPanel] = useState(false)
  const [toast, setToast] = useState(null)  // { msg, type }
  const [editingReservation, setEditingReservation] = useState(null)
  const [opsBarId, setOpsBarId] = useState(() => new URLSearchParams(window.location.search).get('id'))
  const [opsBarAction, setOpsBarAction] = useState(() => new URLSearchParams(window.location.search).get('ops_action'))

  function showToast(msg, type='info') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 6000)
  }
  const [dataDate, setDataDate] = useState(() => {
    return localStorage.getItem('ico_data_date') || DATA_DATE
  })
  const [liveMatMap, setLiveMatMap] = useState(null)
  const [liveDealerMap, setLiveDealerMap] = useState(null)
  const [dataLoading, setDataLoading] = useState(false)
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  const [sellerEmail, setSellerEmail] = useState(() => localStorage.getItem('ico_seller_email') || '')
  // coordsMap imported below

  const loadReservations = useCallback(async () => {
    try {
      const data = await fetchReservations()
      setReservations(data)
      setResLoading(false)
    } catch(e) {
      console.error('Could not load reservations:', e)
      setResLoading(false)
    }
  }, [])

  useEffect(() => { loadReservations() }, [loadReservations])

  // Poll for reservation status changes every 20s (RSM gets notified in-app)
  const prevOpsStatuses = React.useRef(null)  // null = not yet initialized
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const data = await fetchReservations()
        if (prevOpsStatuses.current === null) {
          // First poll — just initialize, don't fire toasts
          const init = {}
          data.forEach(r => { if (r.opsStatus) init[r.id] = r.opsStatus })
          prevOpsStatuses.current = init
        } else {
          // Subsequent polls — check for changes
          data.forEach(r => {
            if (!r.opsStatus) return
            const prev = prevOpsStatuses.current[r.id]
            if (prev === 'PENDING' && (r.opsStatus === 'APPROVED' || r.opsStatus === 'DECLINED')) {
              showToast(
                `${r.opsStatus === 'APPROVED' ? '✓' : '✗'} ${r.dealerName} (${r.zip}) ${r.opsStatus.toLowerCase()} by ICO Ops${r.elapsedMinutes ? ' in ' + r.elapsedMinutes + 'm' : ''}`,
                r.opsStatus === 'APPROVED' ? 'success' : 'error'
              )
            }
            prevOpsStatuses.current[r.id] = r.opsStatus
          })
        }
        setReservations(data)
      } catch(e) {}
    }, 20000)
    return () => clearInterval(interval)
  }, [])

  // Handle URL params (from email links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const paramZip = params.get('zip')
    const paramLeads = params.get('leads')
    const opsAction = params.get('ops_action')
    const opsId = params.get('id')

    if (paramZip) {
      setTimeout(() => {
        if (paramLeads) setDesired(paramLeads)
        runCheck(paramZip)
      }, 800)
    }

    // ops_action=review: just show sticky bar (no auto-action)
    // ops_action=approve/decline: show bar and auto-action after PIN
    // Both cases: bar handles it via opsBarId + opsBarAction state
  }, [])

  // Load live data from Redis on startup if available
  useEffect(() => {
    async function loadLiveData() {
      try {
        const metaRes = await fetch('/api/matdata?type=meta')
        if (!metaRes.ok) return
        const meta = await metaRes.json()
        if (!meta.mat && !meta.dealer) return  // nothing in Redis yet

        setDataLoading(true)

        // Fetch all live data in parallel
        const fetches = []
        if (meta.mat) fetches.push(fetch('/api/matdata?type=mat').then(r => r.ok ? r.json() : null).catch(() => null))
        else fetches.push(Promise.resolve(null))
        if (meta.dealer) fetches.push(fetch('/api/matdata?type=dealer').then(r => r.ok ? r.json() : null).catch(() => null))
        else fetches.push(Promise.resolve(null))

        const [matResult, dealerResult] = await Promise.all(fetches)

        if (matResult?.matMap) {
          setLiveMatMap(matResult.matMap)
          setDataDate(matResult.meta.date)
          localStorage.setItem('ico_data_date', matResult.meta.date)
        }
        if (dealerResult?.dealerMap) {
          setLiveDealerMap(dealerResult.dealerMap)
        }

        setDataLoading(false)
      } catch(e) {
        console.log('No live data available, using bundled data')
        setDataLoading(false)
      }
    }
    loadLiveData()
  }, [])

  // Ask for seller name once
  useEffect(() => {
    if (!sellerName) setShowNamePrompt(true)
  }, [sellerName])

  function saveName(name, email) {
    const n = name.trim()
    if (n) { setSellerName(n); localStorage.setItem('ico_seller_name', n) }
    const e = (email || '').trim()
    if (e) { setSellerEmail(e); localStorage.setItem('ico_seller_email', e) }
    setShowNamePrompt(false)
  }

  function handleZipClick(zipVal) {
    setZip(zipVal)
    // Use zipVal directly instead of reading stale state via setTimeout
    runCheck(zipVal)
  }

  function handleCheck() {
    runCheck(zip)
  }

  function runCheck(rawZip) {
    setError(''); setResult(null)
    let z = rawZip.trim()
    while (z.length < 5) z = '0' + z
    if (!/^\d{4,5}$/.test(rawZip.trim())) { setError('Please enter a valid 4 or 5-digit zip code.'); return }
    const activeMap = liveMatMap || matMap
    const info = getZipInfo(z, activeMap)
    if (!info) { setError(`Zip code ${z} was not found in the current dataset.`); return }
    const av = calcAvailability(z, reservations, activeMap)
    const des = desired ? parseInt(desired, 10) : null
    // Compute nearby whitespace from precomputed top-2000 list (fast — no 40k loop)
    const sc = coordsMap[z]
    const whitespace = sc ? whitespaceZips
      .map(w => ({ ...w, dist: Math.round(haversine(sc[0], sc[1], w.lat, w.lon) * 10) / 10 }))
      .filter(w => w.dist <= 45)
      .sort((a, b) => b.avail - a.avail)
      : []
    setResult({ info, av, desired: des, whitespace })
    // Save to recent searches (enhancement 5)
    setRecentZips(prev => {
      const next = [{ zip: z, city: info.city, state: info.state }, ...prev.filter(r => r.zip !== z)].slice(0, 8)
      localStorage.setItem('ico_recent_zips', JSON.stringify(next))
      return next
    })
  }

  // Single refresh function used by both reserve and release actions
  async function refreshReservations() {
    const fresh = await fetchReservations()
    setReservations(fresh)  // updates status bar count immediately
    setResLoading(false)
    if (result) {
      const av = calcAvailability(result.info.zip, fresh)
      setResult(r => ({...r, av}))
    }
  }

  async function handleCancel(id) {
    await cancelReservation(id)
    await refreshReservations()
  }

  async function onReserved() {
    await refreshReservations()
  }

  // Determine verdict
  // Rules:
  // APPROVED: base covers request on its own
  // APPROVABLE: inner ring (0-15 or 15-30mi) covers request AND overage is <= 1.5x that ring
  // REVIEW REQUIRED: only outer ring (30-45mi) covers, OR overage is large, OR underdelivery
  // DENIED: no ring covers the request
  let verdict = null, vClass = 'caution', vIcon = '~'
  if (result) {
    const { base, best15, best30, best45, hasUnderdeliveryWarning } = result.av
    const des = result.desired
    const baseOverage = base !== null && base < 0 ? Math.abs(base) : 0

    if (base === null) {
      verdict='UNKNOWN'; vClass='caution'; vIcon='?'
    } else if (des !== null) {
      if (base !== null && base > 0 && base >= des) {
        verdict='APPROVED'; vClass='approve'; vIcon='✓'
      } else if (best15 < des && best30 < des && best45 < des) {
        verdict='DENIED'; vClass='deny'; vIcon='✗'
      } else if (hasUnderdeliveryWarning) {
        verdict='REVIEW_REQUIRED'; vClass='caution'; vIcon='~'
      } else {
        // Which ring covers the request?
        const bestCovering = best15 >= des ? best15 : best30 >= des ? best30 : best45
        const coveringRing = best15 >= des ? 15 : best30 >= des ? 30 : 45
        const overageRatio = bestCovering > 0 ? baseOverage / bestCovering : Infinity
        const innerEmpty = best15 === 0 && best30 === 0
        if (coveringRing <= 30 && overageRatio <= 1.5) {
          verdict='APPROVABLE'; vClass='caution'; vIcon='~'
        } else {
          verdict='REVIEW_REQUIRED'; vClass='caution'; vIcon='~'
        }
      }
    } else {
      if (base > 0)        { verdict='AVAILABLE';  vClass='approve'; vIcon='✓' }
      else if (best15 > 0) { verdict=hasUnderdeliveryWarning?'REVIEW_REQUIRED':'BOOSTABLE'; vClass='caution'; vIcon='~' }
      else                 { verdict='OVERSOLD';   vClass='deny';    vIcon='✗' }
    }
  }

  return (
    <>
      {/* Seller name prompt */}
      {showNamePrompt && (
        <div className="import-modal-overlay open">
          <div className="import-modal" style={{maxWidth:380}}>
            <div className="import-modal-title">Welcome</div>
            <div className="import-modal-sub">Enter your name so reservations show who made them.</div>
            <NameForm onSave={saveName} />
          </div>
        </div>
      )}

      {editingReservation && (
        <EditReservationModal
          reservation={editingReservation}
          dealerMapData={liveDealerMap || dealerMap}
          av={result?.av || null}
          sellerName={sellerName}
          sellerEmail={sellerEmail}
          onSave={async (updated) => {
            await loadReservations()
            setEditingReservation(null)
            showToast(`✓ ${updated.dealerName} reservation updated`, 'success')
          }}
          onClose={() => setEditingReservation(null)}
        />
      )}

      {opsBarId && (
        <StickyOpsBar
          reservationId={opsBarId}
          action={opsBarAction}
          reservations={reservations}
          onDone={(msg) => { setOpsBarId(null); showToast(msg, 'success') }}
        />
      )}

      {toast && (
        <div className={`toast toast-${toast.type}`} onClick={() => setToast(null)}>
          {toast.msg}
        </div>
      )}

      {showModal && <UpdateModal onClose={() => setShowModal(false)} onDataUpdated={(date, liveMat, liveDealer) => { setDataDate(date); localStorage.setItem('ico_data_date', date); if (liveMat) setLiveMatMap(liveMat); if (liveDealer) setLiveDealerMap(liveDealer) }} />}

      {opsBarId && <div style={{height:56}} />}
      <header>
        <img src={`data:image/png;base64,${KBB_LOGO_B64}`} alt="KBB 100 Years" style={{height:48,width:'auto'}} />
        <h1>ICO Intelligence</h1>
        {sellerName && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,.4)'}}>{sellerName}</span>
            {dataLoading && <span style={{fontSize:11,color:'rgba(255,255,255,.6)',fontFamily:'var(--mono)',marginRight:4}}>⟳ Updating data…</span>}
        <button className="mkt-intel-btn" onClick={() => setShowMarkets(m => !m)}>📊 Market Intel</button>
            <button className="import-trigger-btn" onClick={() => setShowOpsPanel(true)}>🔐 Ops Queue</button>
            <button className="import-trigger-btn" onClick={() => setShowModal(true)}>↑ Update Data</button>
          </div>
        )}
      </header>

      <div className="import-bar">
        <div id="importStatus" style={{fontSize:11,fontFamily:'var(--mono)'}}>
          {resLoading ? (
            <span style={{color:'rgba(255,255,255,.4)'}}>Loading reservations…</span>
          ) : (
            <button
              className="res-status-btn"
              onClick={() => setShowResSlideout(true)}
            >
              {reservations.filter(r=>r.status==='active').length} active reservation(s) — click to view by DMA
            </button>
          )}
        </div>
      </div>

      {showOpsPanel && (
        <OpsPanel
          reservations={reservations}
          onClose={() => setShowOpsPanel(false)}
          onUpdated={async (msg) => { await loadReservations(); if (msg) { setShowOpsPanel(false); showToast(msg, 'success') } }}
          opsActionFromUrl={new URLSearchParams(window.location.search).get('ops_action')}
          opsIdFromUrl={new URLSearchParams(window.location.search).get('id')}
        />
      )}
      {showResSlideout && (
        <ReservationSlideout
          reservations={reservations}
          onCancel={handleCancel}
          onClose={() => setShowResSlideout(false)}
          onRefresh={loadReservations}
          onEdit={(r) => { setEditingReservation(r); setShowResSlideout(false) }}
          sellerName={sellerName}
        />
      )}

      <main>
        <div className="search-box">
          <span className="lbl">Zip Code Lookup</span>
          <div className="search-row">
            <div style={{flex:1}}>
              <input
                className="zip-input" id="zipInput"
                maxLength={5} placeholder="00000"
                value={zip} onChange={e => setZip(e.target.value.replace(/[^0-9]/g,'').slice(0,5))}
                onKeyDown={e => e.key === 'Enter' && handleCheck()}
              />
            </div>
            <div>
              <span className="lbl-sm">Desired Leads / Mo</span>
              <input
                className="desired-input" type="number"
                placeholder="200" min={1} max={9999}
                value={desired} onChange={e => setDesired(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCheck()}
              />
            </div>
            <button className="check-btn" onClick={handleCheck}>Check</button>
          </div>
        </div>

        {showMarkets && <HotMarketsPanel onZipClick={z => { setZip(z); setShowMarkets(false); runCheck(z) }} />}

        {recentZips.length > 0 && !showMarkets && (
          <div className="recent-zips">
            <span className="recent-label">Recent:</span>
            {recentZips.map(r => (
              <button key={r.zip} className="recent-zip-btn" onClick={() => { setZip(r.zip); runCheck(r.zip) }}>
                {r.zip} <span className="recent-city">{r.city}, {r.state}</span>
              </button>
            ))}
          </div>
        )}

        {error && <div className="error-msg">{error}</div>}

        {result && (() => {
          const { info, av, desired: des } = result
          const isBC = info.target !== null
          let barPct = 0, barClass = 'bar-green'
          if (isBC && info.avail !== null) {
            const tot = info.target + Math.max(info.avail, 0)
            barPct = tot > 0 ? Math.min(100, Math.round(info.target / tot * 100)) : 100
            barClass = barPct > 90 ? 'bar-red' : barPct > 70 ? 'bar-yellow' : 'bar-green'
          }

          let recText = ''
          const base = av.base
          const dmaTier = getDmaTier(info.dma)
          const tierMin = getTierMinLeads(dmaTier)
          const belowTierMin = des && des < tierMin

          if (base === null) recText = 'Availability data missing. Contact ICO Operations.'
          else if (des) {
            if (base >= des)           recText = `Zip ${info.zip} has <strong>${fmtN(base)} leads available</strong> in its own pool — enough to support your requested ${fmtN(des)} leads/mo. Approvable on base availability alone.`
            else if (av.best15 >= des) recText = `Base availability (${fmtN(base)}) is below your requested ${fmtN(des)}, but a neighboring zip within 15 miles has <strong>${fmtN(av.best15)} available</strong> — enough to justify approval with the 0–15 mi booster.`
            else if (av.best30 >= des) recText = `Base and 0–15 mi availability fall short, but a zip in the 15–30 mi band has <strong>${fmtN(av.best30)} available</strong> — a case can be made to ICO Ops.`
            else if (av.best45 >= des) recText = `Only the 30–45 mi ring shows availability. With a base overage of ${fmtN(Math.abs(base))} and no inner-ring headroom, this requires <strong>manual ICO Ops review</strong> — not a standard approval. Submit with the booster zip and let Ops assess the radius overlap.`
            else                       recText = `Even at 45 miles, max nearby availability is <strong>${fmtN(av.best45)}</strong> — below your requested ${fmtN(des)}. This market cannot support the request at this time.`
            if (belowTierMin) recText += ` <strong style='color:#c2410c'>\u26a0 Tier ${dmaTier} market requires a minimum of ${tierMin} unique leads — your request of ${fmtN(des)} is below the threshold.</strong>`
          } else {
            if (base > 0)             recText = `Zip ${info.zip} has <strong>${fmtN(base)} leads available</strong>. Enter a desired lead amount to check a specific request.`
            else if (av.best15 > 0)   recText = `Base is ${fmtN(base)}, but a nearby zip within 15 miles has <strong>${fmtN(av.best15)} available</strong>. A new BC may be approvable.`
            else                      recText = `Base is ${fmtN(base)} and no nearby headroom found within 45 miles.`
          }

          return (
            <>
              <div className="res-header">
                <div className={`badge badge-${vClass}`}>
                  <div className="badge-icon">{vIcon}</div>
                  <div className="badge-label">{verdict?.replace('_',' ')}</div>
                </div>
                <div className="loc">
                  <div className="loc-name">{info.city}, {info.state} <span className="loc-zip">{info.zip}</span></div>
                  <div className="loc-sub">15-Mile Radius · {isBC ? 'Active Buying Center' : 'No Active Buying Center'}</div>
                  <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                    <div className="dma-tag">{info.dma}</div>
                    {(() => {
                      const tier = getDmaTier(info.dma)
                      const minLeads = getTierMinLeads(tier)
                      const tierColors = { A:'#00205b', B:'#1d4ed8', C:'#f5a800', D:'#6b7280' }
                      return tier ? (
                        <span style={{
                          background: tierColors[tier], color: tier === 'C' ? '#00205b' : '#fff',
                          fontFamily:'var(--cond)', fontWeight:700, fontSize:10,
                          padding:'2px 7px', borderRadius:4, letterSpacing:.5
                        }}>
                          TIER {tier} · MIN {minLeads} LEADS
                        </span>
                      ) : null
                    })()}
                  </div>
                </div>
              </div>

              {isBC && info.avail !== null && (
                <div className="bar-wrap">
                  <div className="bar-header">
                    <span className="bar-label">Zip Capacity Utilization</span>
                    <span className="bar-pct">{barPct}% allocated</span>
                  </div>
                  <div className="bar-track">
                    <div className={`bar-fill ${barClass}`} style={{width:`${barPct}%`}}></div>
                  </div>
                </div>
              )}

              <div className={`rec rec-${vClass}`}>
                <div className="rec-title">ICO Ops Assessment</div>
                <div className="rec-body" dangerouslySetInnerHTML={{__html: recText}} />
              </div>

              <DemographicsCard zip={info.zip} city={info.city} state={info.state} />
              <ApprovalScoreCard
                av={av}
                desired={des}
                dmaRank={Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===info.dma)+1}
                totalDmas={Object.keys(dmaSaturation).length}
              />
              <MarketIntelligenceInline zip={info.zip} dma={info.dma} av={av} nearbyWhitespace={result.whitespace || []} />
              <AvailCards av={av} desired={des} />

              {des && (
                <ReserveBox
                  zipInfo={info}
                  desired={des}
                  reserved={reservations}
                  onReserved={onReserved}
                  sellerName={sellerName}
                  sellerEmail={sellerEmail}
                  verdict={verdict}
                  dealerMapData={liveDealerMap || dealerMap}
                  approvalScore={result?.av ? calcApprovalScore(result.av, des,
                    Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===info.dma)+1,
                    Object.keys(dmaSaturation).length
                  )?.score : null}
                  av={av}
                />
              )}

              <MarketExtensionCard searchZip={info.zip} searchCoords={coordsMap[info.zip]} />
              <DealerGroupCard
                searchZip={info.zip}
                dma={info.dma}
                reservations={reservations}
                onReserved={onReserved}
                sellerName={sellerName}
                liveDealerMap={liveDealerMap}
              />
              <TenureInsightForZip dma={info.dma} searchZip={info.zip} />
              <DealerTable dma={info.dma} searchZip={info.zip} liveDealerMap={liveDealerMap} />
              <ZipNotes zip={info.zip} sellerName={sellerName} />
              <ComparablesCard
                zip={info.zip}
                av={av}
                desired={des}
                dmaRank={Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===info.dma)+1}
                totalDmas={Object.keys(dmaSaturation).length}
              />

              <DataFreshnessFooter dataDate={dataDate} />
            </>
          )
        })()}

        <ReservationsPanel
          reservations={reservations}
          onCancel={handleCancel}
          onRefresh={loadReservations}
          onEdit={setEditingReservation}
          currentUser={sellerName}
        />
      </main>
    </>
  )
}




// ── Approval Likelihood Score ─────────────────────────────────────────────

// ── DMA Market Tier Classification ─────────────────────────────────────────
function getDmaTier(dma) {
  if (!dma) return null
  const sorted = Object.entries(dmaSaturation).sort((a, b) => b[1].target - a[1].target)
  const total = sorted.length
  const idx = sorted.findIndex(([d]) => d === dma.toUpperCase())
  if (idx < 0) return null
  const pct = idx / total
  if (pct < 0.25) return 'A'
  if (pct < 0.50) return 'B'
  if (pct < 0.75) return 'C'
  return 'D'
}

function getTierMinLeads(tier) {
  return (tier === 'A' || tier === 'B') ? 100 : 50
}

function calcApprovalScore(av, desired, dmaRank, totalDmas) {
  if (!desired || desired === 0) return null
  const { base, best15, best30, best45, hasUnderdeliveryWarning, ring15 } = av
  if (base === null) return null

  const baseOverage = base < 0 ? Math.abs(base) : 0
  const bestCovering = best15 >= desired ? best15 : best30 >= desired ? best30 : best45 >= desired ? best45 : 0
  const overageRatio = bestCovering > 0 ? baseOverage / bestCovering : (baseOverage > 0 ? 99 : 0)
  const dmaPct = dmaRank / totalDmas

  // Factor 1: Base availability (0-3)
  const f1 = base >= desired ? 3 : base >= 0 ? 2 : baseOverage < 200 ? 1 : 0

  // Factor 2: Ring coverage (0-3)
  const f2 = best15 >= desired ? 3 : best30 >= desired ? 2 : best45 >= desired ? 1 : 0

  // Factor 3: Overage ratio (0-2)
  const f3 = overageRatio === 0 ? 2 : overageRatio <= 0.5 ? 2 : overageRatio <= 1.0 ? 1.5 : overageRatio <= 1.5 ? 1 : 0

  // Factor 4: DMA health (0-1)
  const f4 = dmaPct <= 0.5 ? 1 : dmaPct <= 0.85 ? 0.5 : 0

  // Factor 5: Underdelivery (0-1)
  const f5 = hasUnderdeliveryWarning ? 0 : 1

  // Factor 6: Nearby BC delivery performance within 15mi (0-1)
  // ICO Ops specifically looks at how existing BCs in the market are delivering
  // Underdelivering neighbors signal market saturation or process issues
  let f6 = 0.5  // neutral default when no data
  let nearbyBCDeliveryNote = null
  if (ring15 && ring15.length > 0) {
    const nearbyBCs = ring15.filter(e => e.hasBC && e.odPct !== null)
    if (nearbyBCs.length > 0) {
      const avgPct = nearbyBCs.reduce((s, e) => s + (e.odPct || 1), 0) / nearbyBCs.length
      const underCount = nearbyBCs.filter(e => e.underdelivery).length
      const overCount = nearbyBCs.filter(e => e.odPct >= 1.0).length
      if (underCount >= 2 || (underCount > 0 && underCount / nearbyBCs.length > 0.5)) {
        f6 = 0  // Multiple underdelivering BCs within 15mi — red flag for Ops
        nearbyBCDeliveryNote = `${underCount} of ${nearbyBCs.length} BCs within 15mi underdelivering — Ops will scrutinize market health`
      } else if (underCount === 1) {
        f6 = 0.25  // One underdelivering BC — caution
        nearbyBCDeliveryNote = `1 BC within 15mi underdelivering — worth noting to Ops`
      } else if (avgPct >= 1.0) {
        f6 = 1  // All nearby BCs delivering at or above target
        nearbyBCDeliveryNote = `Nearby BCs averaging ${Math.round(avgPct * 100)}% of target — healthy market`
      } else {
        f6 = 0.5
      }
    }
  }

  const score = Math.round(Math.min(10, Math.max(1, f1 + f2 + f3 + f4 + f5 + f6)))

  const bands = [
    [9, 10, 'Strong',  '#00c896', 'Strong approval candidate — base availability and nearby BC performance support the request.'],
    [7,  8, 'Good',    '#4ade80', 'Good candidate — inner ring availability supports the request. Present to ICO Ops with confidence.'],
    [5,  6, 'Fair',    '#f5a800', 'Approvable with context — availability exists but market constraints require ICO Ops review.'],
    [3,  4, 'Weak',    '#f97316', 'Weak candidate — overage, outer-ring-only coverage, or underdelivering neighbors make approval difficult.'],
    [1,  2, 'Poor',    '#ff4757', 'Unlikely to approve — insufficient availability or significant market health concerns.'],
  ]
  const band = bands.find(([lo, hi]) => score >= lo && score <= hi) || bands[4]

  return { score, label: band[2], color: band[3], rationale: band[4], f1, f2, f3, f4, f5, f6, nearbyBCDeliveryNote }
}

function ApprovalScoreCard({ av, desired, dmaRank, totalDmas }) {
  const result = calcApprovalScore(av, desired, dmaRank, totalDmas)
  if (!result) return null
  const { score, label, color, rationale, f1, f2, f3, f4, f5, f6, nearbyBCDeliveryNote } = result
  const [showBreakdown, setShowBreakdown] = useState(false)

  const factors = [
    { name: 'Base Availability',     val: f1, max: 3 },
    { name: 'Ring Coverage',         val: f2, max: 3 },
    { name: 'Overage Ratio',         val: f3, max: 2 },
    { name: 'DMA Health',            val: f4, max: 1 },
    { name: 'Delivery Trend',        val: f5, max: 1 },
    { name: 'Nearby BC Performance', val: f6, max: 1 },
  ]

  return (
    <div className="score-card">
      <div className="score-main">
        <div className="score-gauge" style={{borderColor: color}}>
          <div className="score-number" style={{color}}>{score}</div>
          <div className="score-denom">/10</div>
        </div>
        <div className="score-info">
          <div className="score-label" style={{color}}>{label} Approval Likelihood</div>
          <div className="score-rationale">{rationale}</div>
          {result.nearbyBCDeliveryNote && (
            <div style={{fontSize:11,marginTop:4,padding:'4px 8px',borderRadius:4,
              background: result.f6 === 0 ? '#fff0f0' : result.f6 >= 1 ? '#f0fdf4' : '#fffbeb',
              color: result.f6 === 0 ? 'var(--red)' : result.f6 >= 1 ? '#15803d' : '#92400e',
              fontStyle:'italic'
            }}>
              {result.nearbyBCDeliveryNote}
            </div>
          )}
          <button className="score-breakdown-btn" onClick={() => setShowBreakdown(b => !b)}>
            {showBreakdown ? 'Hide breakdown' : 'Show score breakdown'}
          </button>
        </div>
      </div>
      {showBreakdown && (
        <div className="score-breakdown">
          {factors.map(f => (
            <div key={f.name} className="score-factor">
              <div className="score-factor-name">{f.name}</div>
              <div className="score-factor-bar">
                <div className="score-factor-fill" style={{width: `${(f.val/f.max)*100}%`, background: color}} />
              </div>
              <div className="score-factor-val">{f.val}/{f.max}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Market Extension Pilot ────────────────────────────────────────────────
const PILOT_MARKETS = [
  {
    id: 'boston',
    name: 'Boston',
    state: 'MA',
    anchor: '02108',
    lat: 42.3576,
    lon: -71.0684,
    description: 'Dense urban market with limited dealer presence. High consumer offer volume with significant untapped availability.',
    pools: {
      10: { zips: 118, avail: 476805, whitespace: 92, wAvail: 377679 },
      15: { zips: 156, avail: 601147, whitespace: 117, wAvail: 460381 },
      25: { zips: 258, avail: 790545, whitespace: 192, wAvail: 600477 },
    }
  },
  {
    id: 'nyc',
    name: 'New York City',
    state: 'NY',
    anchor: '10001',
    lat: 40.7484,
    lon: -73.9967,
    description: 'Largest urban market in the US. Extremely high offer volume with no physical space for traditional dealerships in the core.',
    pools: {
      10: { zips: 305, avail: 902484, whitespace: 0,  wAvail: 0 },
      15: { zips: 443, avail: 1231832, whitespace: 0, wAvail: 0 },
      25: { zips: 668, avail: 1652306, whitespace: 18, wAvail: 36150 },
    }
  }
]

const PILOT_RADIUS_MI = 50  // dealers within this radius are eligible

function MarketExtensionCard({ searchZip, searchCoords }) {
  const [selectedRadius, setSelectedRadius] = useState(15)

  if (!searchCoords) return null

  // Check if this zip is within 50mi of any pilot market
  const eligible = PILOT_MARKETS.filter(m => {
    const dist = haversine(searchCoords[0], searchCoords[1], m.lat, m.lon)
    return dist <= PILOT_RADIUS_MI && dist > 0  // exclude if they ARE the anchor
  }).map(m => ({
    ...m,
    distFromAnchor: Math.round(haversine(searchCoords[0], searchCoords[1], m.lat, m.lon) * 10) / 10
  }))

  if (eligible.length === 0) return null

  return (
    <div className="ext-panel">
      <div className="ext-header">
        <div className="ext-title-row">
          <span className="ext-pilot-badge">PILOT</span>
          <div className="ext-title">Market Extension Available</div>
        </div>
        <div className="ext-subtitle">
          This zip is eligible to purchase leads from {eligible.length > 1 ? 'urban core markets' : 'an urban core market'} where physical dealership presence is limited. This is an ICO pilot program — contact your ICO Ops manager to participate.
        </div>
      </div>

      <div className="ext-radius-selector">
        <span className="ext-radius-label">Urban core radius:</span>
        {[10, 15, 25].map(r => (
          <button
            key={r}
            className={`ext-radius-btn ${selectedRadius === r ? 'ext-radius-active' : ''}`}
            onClick={() => setSelectedRadius(r)}
          >
            {r} mi
          </button>
        ))}
      </div>

      <div className="ext-markets">
        {eligible.map(m => {
          const pool = m.pools[selectedRadius]
          return (
            <div key={m.id} className="ext-market-card">
              <div className="ext-market-header">
                <div className="ext-market-name">{m.name}, {m.state}</div>
                <div className="ext-market-dist">{m.distFromAnchor}mi from your zip</div>
              </div>
              <div className="ext-market-desc">{m.description}</div>
              <div className="ext-market-stats">
                <div className="ext-stat">
                  <div className="ext-stat-val avail-pos">{fmtN(pool.avail)}</div>
                  <div className="ext-stat-label">leads available within {selectedRadius}mi of city center</div>
                </div>
                <div className="ext-stat">
                  <div className="ext-stat-val" style={{color:'var(--navy)'}}>{pool.zips}</div>
                  <div className="ext-stat-label">zip codes in pool</div>
                </div>
                {pool.whitespace > 0 && (
                  <div className="ext-stat">
                    <div className="ext-stat-val" style={{color:'#7c3aed'}}>{pool.whitespace}</div>
                    <div className="ext-stat-label">whitespace zips (no active BC)</div>
                  </div>
                )}
              </div>
              <div className="ext-cta">
                {/* PILOT: reservation capability pending leadership approval */}
                <div className="ext-pending-note">
                  🔒 Lead reservation for market extension is pending pilot approval.
                  To express interest, contact your ICO Ops manager and reference zip <strong>{searchZip}</strong> + <strong>{m.name} Market Extension</strong>.
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="ext-footer">
        Market Extension is an ICO pilot program limited to Boston and New York City. Eligibility is based on your dealer zip being within {PILOT_RADIUS_MI} miles of the urban core. Availability figures reflect current Opportunity Finder OLR data.
      </div>
    </div>
  )
}


// ── Zip Notes ─────────────────────────────────────────────────────────────
async function fetchNotes(zip) {
  try {
    const res = await fetch(`/api/notes?zip=${zip}`)
    if (!res.ok) return []
    return res.json()
  } catch { return [] }
}

async function saveNote(zip, text, author) {
  try {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip, text, author, createdAt: new Date().toISOString() })
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function deleteNote(zip, noteId) {
  try {
    await fetch('/api/notes', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zip, noteId })
    })
  } catch {}
}

function ZipNotes({ zip, sellerName }) {
  const [notes, setNotes] = useState([])
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    fetchNotes(zip).then(n => { setNotes(n); setLoading(false) })
  }, [zip])

  async function handleSave() {
    if (!text.trim()) return
    setSaving(true)
    const note = await saveNote(zip, text.trim(), sellerName || 'Unknown')
    if (note) {
      setNotes(prev => [note, ...prev])
      setText('')
    }
    setSaving(false)
  }

  async function handleDelete(noteId) {
    await deleteNote(zip, noteId)
    setNotes(prev => prev.filter(n => n.id !== noteId))
  }

  return (
    <div className="notes-panel">
      <div className="notes-title">📝 Seller Notes — {zip}</div>
      <div className="notes-input-row">
        <input
          className="notes-input"
          placeholder="Add a note (e.g. spoke to dealer 4/6, interested in 150 leads...)"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSave()}
        />
        <button className="notes-save-btn" onClick={handleSave} disabled={saving || !text.trim()}>
          {saving ? 'Saving…' : 'Add'}
        </button>
      </div>
      {loading ? (
        <div className="notes-empty">Loading notes…</div>
      ) : notes.length === 0 ? (
        <div className="notes-empty">No notes yet for this zip. Add one above.</div>
      ) : (
        <div className="notes-list">
          {notes.map(n => (
            <div key={n.id} className="note-item">
              <div className="note-text">{n.text}</div>
              <div className="note-meta">
                <span className="note-author">{n.author}</span>
                <span className="note-date">{fmtDate(n.createdAt)}</span>
                <button className="note-delete" onClick={() => handleDelete(n.id)} title="Delete note">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}


// ── Demographics Card ─────────────────────────────────────────────────────
function DemographicsCard({ zip, city, state }) {
  const d = demoMap[zip]
  if (!d || !d[0]) return null
  const [pop, inc, age, hval] = d

  const fmt = n => n ? Number(n).toLocaleString() : '—'
  const fmtUSD = n => n ? '$' + Number(n).toLocaleString() : '—'

  const incLabel = inc
    ? inc >= 100000 ? 'High income' : inc >= 65000 ? 'Mid-high income' : inc >= 45000 ? 'Mid income' : 'Below average'
    : null
  const incColor = inc
    ? inc >= 100000 ? 'var(--green)' : inc >= 65000 ? '#4ade80' : inc >= 45000 ? '#f5a800' : 'var(--muted)'
    : 'var(--muted)'

  return (
    <div className="demo-card">
      <div className="demo-title">📍 Zip Code Intelligence — {zip}</div>
      <div className="demo-grid">
        <div className="demo-stat">
          <div className="demo-val">{fmt(pop)}</div>
          <div className="demo-label">Population</div>
        </div>
        <div className="demo-stat">
          <div className="demo-val" style={{color: incColor}}>{fmtUSD(inc)}</div>
          <div className="demo-label">Median Household Income {incLabel && <span className="demo-badge" style={{background: incColor + '20', color: incColor}}>{incLabel}</span>}</div>
        </div>
        <div className="demo-stat">
          <div className="demo-val">{age ? age.toFixed(1) : '—'}</div>
          <div className="demo-label">Median Age</div>
        </div>
        <div className="demo-stat">
          <div className="demo-val">{fmtUSD(hval)}</div>
          <div className="demo-label">Median Home Value</div>
        </div>
      </div>
      <div className="demo-source">Source: U.S. Census Bureau, ACS 5-Year Estimates (2022)</div>
    </div>
  )
}

// ── Comparable Markets ────────────────────────────────────────────────────
function ComparablesCard({ zip, av, desired, dmaRank, totalDmas }) {
  const compZips = comparablesMap[zip]
  if (!compZips || compZips.length === 0) return null

  return (
    <div className="comp-card">
      <div className="comp-title">🔍 Comparable Markets</div>
      <div className="comp-subtitle">
        Similar BCs nationally — same population range, income level, and market saturation. Use these as benchmarks when presenting to ICO Ops.
      </div>
      <div className="comp-table-wrap"><table className="comp-table">
        <thead>
          <tr>
            <th>Zip</th><th>Location</th><th className="th-r">Population</th>
            <th className="th-r">Income</th><th className="th-r">Availability</th>
            <th className="th-r">Score</th>
          </tr>
        </thead>
        <tbody>
          {compZips.map(z => {
            const mr = matMap[z]
            if (!mr) return null
            const d = demoMap[z] || [null,null,null,null]
            const dmaR = Object.entries(dmaSaturation).sort((a,b)=>b[1].avail-a[1].avail).findIndex(([d])=>d===mr[2])+1
            // Quick score for comparable (simplified - no ring data available without full calc)
            const baseScore = mr[4] === null ? null :
              mr[4] > 0 ? Math.min(10, Math.round(7 + (mr[4] / 500))) : Math.max(1, Math.round(5 - (Math.abs(mr[4]) / 500)))
            const scoreColor = baseScore >= 8 ? 'var(--green)' : baseScore >= 6 ? '#f5a800' : baseScore >= 4 ? '#f97316' : 'var(--red)'
            return (
              <tr key={z}>
                <td className="td-mono">{z}</td>
                <td>{mr[0]}, {mr[1]} <span className="comp-dma">{mr[2]}</span></td>
                <td className="td-right td-dim">{d[0] ? Number(d[0]).toLocaleString() : '—'}</td>
                <td className="td-right td-dim">{d[1] ? '$' + Number(d[1]).toLocaleString() : '—'}</td>
                <td className={`td-right td-num ${mr[4] >= 0 ? 'avail-pos' : 'avail-neg'}`}>{mr[4] !== null ? Number(mr[4]).toLocaleString() : '—'}</td>
                <td className="td-right" style={{color: scoreColor, fontFamily:'var(--mono)', fontWeight:700}}>
                  {baseScore !== null ? baseScore + '/10' : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table></div>
      <div className="comp-note">Comparables matched by population, income, DMA saturation, and market availability. Scores are baseline estimates.</div>
    </div>
  )
}


// ── Dealer Group Card ─────────────────────────────────────────────────────
function DealerGroupCard({ searchZip, dma, reservations, onReserved, sellerName, liveDealerMap }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [selectedStores, setSelectedStores] = useState({})
  const [leadsPerStore, setLeadsPerStore] = useState({})
  const [reservingGroup, setReservingGroup] = useState(false)
  const [groupReserved, setGroupReserved] = useState(false)

  // Auto-detect group from searched zip
  const autoGroup = React.useMemo(() => {
    // Find the dealer at this zip
    for (const [gname, stores] of Object.entries(groupIndex)) {
      if (stores.some(s => s[0] === searchZip)) {
        return { name: gname, stores }
      }
    }
    return null
  }, [searchZip])

  // Search results for manual search
  const searchResults = React.useMemo(() => {
    if (!searchTerm || searchTerm.length < 2) return []
    const term = searchTerm.toLowerCase()
    return Object.entries(groupIndex)
      .filter(([name]) => name.toLowerCase().includes(term))
      .slice(0, 8)
      .map(([name, stores]) => ({ name, stores }))
  }, [searchTerm])

  const activeGroup = selectedGroup || autoGroup

  // Initialize store selections when group changes
  React.useEffect(() => {
    if (!activeGroup) return
    const sel = {}
    const leads = {}
    activeGroup.stores.forEach(s => {
      sel[s[0]] = true
      leads[s[0]] = s[3] || 100  // default to target
    })
    setSelectedStores(sel)
    setLeadsPerStore(leads)
    setGroupReserved(false)
  }, [activeGroup?.name, searchZip])

  async function handleGroupReserve() {
    const toReserve = activeGroup.stores.filter(s => selectedStores[s[0]])
    if (!toReserve.length) return
    setReservingGroup(true)
    const groupId = `grp_${Date.now()}`
    try {
      for (const store of toReserve) {
        const zipRec = matMap[store[0]]
        await createReservation({
          zip: store[0],
          city: zipRec ? zipRec[0] : store[2],
          state: zipRec ? zipRec[1] : '',
          dma: store[2],
          leadsReserved: parseInt(leadsPerStore[store[0]]) || store[3] || 100,
          dealerName: store[1],
          notes: `${activeGroup.name} — Group Reservation`,
          reservedBy: sellerName || 'Unknown',
          groupId
        })
      }
      setGroupReserved(true)
      onReserved()
    } catch(e) {
      console.error('Group reservation failed:', e)
    }
    setReservingGroup(false)
  }

  const groupTotalTarget = activeGroup
    ? activeGroup.stores.filter(s => selectedStores[s[0]]).reduce((sum,s) => sum + (s[3]||0), 0)
    : 0
  const groupTotalAvail = activeGroup
    ? activeGroup.stores.filter(s => selectedStores[s[0]]).reduce((sum,s) => sum + (s[4]||0), 0)
    : 0
  const totalLeadsToReserve = activeGroup
    ? activeGroup.stores.filter(s => selectedStores[s[0]]).reduce((sum,s) => sum + (parseInt(leadsPerStore[s[0]])||0), 0)
    : 0

  return (
    <div className="group-card">
      <div className="group-header">
        <div className="group-title">🏢 Dealer Group</div>
        {autoGroup && (
          <div className="group-auto-badge">Auto-detected from {searchZip}</div>
        )}
      </div>

      {/* Manual search fallback */}
      {!autoGroup && (
        <div className="group-search-row">
          <input
            className="group-search-input"
            placeholder="Search by group name (e.g. Oakes, AutoNation, Lithia...)"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setSelectedGroup(null) }}
          />
          {searchResults.length > 0 && (
            <div className="group-search-results">
              {searchResults.map(g => (
                <div key={g.name} className="group-search-result" onClick={() => {
                  setSelectedGroup(g); setSearchTerm(g.name)
                }}>
                  <span className="group-result-name">{g.name}</span>
                  <span className="group-result-count">{g.stores.length} stores</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {autoGroup && selectedGroup === null && (
        <div className="group-switch-row">
          <span className="group-auto-label">Showing: <strong>{autoGroup.name}</strong></span>
          <button className="group-switch-btn" onClick={() => { setSelectedGroup(null); setSearchTerm('') }}>
            Search different group
          </button>
        </div>
      )}

      {activeGroup && (
        <>
          <div className="group-summary-row">
            <div className="group-summary-stat">
              <div className="group-summary-val">{activeGroup.stores.length}</div>
              <div className="group-summary-label">stores</div>
            </div>
            <div className="group-summary-stat">
              <div className="group-summary-val">{fmtN(groupTotalTarget)}</div>
              <div className="group-summary-label">leads/mo allocated</div>
            </div>
            <div className="group-summary-stat">
              <div className="group-summary-val" style={{color: groupTotalAvail >= 0 ? 'var(--green)' : 'var(--red)'}}>
                {fmtN(groupTotalAvail)}
              </div>
              <div className="group-summary-label">net available</div>
            </div>
            <div className="group-summary-stat">
              <div className="group-summary-val">{fmtN(totalLeadsToReserve)}</div>
              <div className="group-summary-label">leads to reserve</div>
            </div>
          </div>

          <table className="group-table">
            <thead>
              <tr>
                <th style={{width:32}}></th>
                <th>Store</th>
                <th>DMA</th>
                <th className="th-r">Target</th>
                <th className="th-r">Available</th>
                <th className="th-r">Tenure</th>
                <th className="th-r">Reserve Leads</th>
              </tr>
            </thead>
            <tbody>
              {activeGroup.stores.map(s => {
                const isSelected = selectedStores[s[0]]
                const availColor = (s[4]||0) >= 0 ? 'var(--green)' : 'var(--red)'
                return (
                  <tr key={s[0]} className={isSelected ? '' : 'group-row-dim'}>
                    <td>
                      <input type="checkbox" checked={!!isSelected}
                        onChange={e => setSelectedStores(p => ({...p, [s[0]]: e.target.checked}))} />
                    </td>
                    <td>
                      <div className="group-store-name">{s[1]}</div>
                      <div className="group-store-zip">{s[0]}</div>
                    </td>
                    <td className="td-dim" style={{fontSize:11}}>{s[2]}</td>
                    <td className="td-right td-num">{fmtN(s[3])}</td>
                    <td className="td-right td-num" style={{color: availColor}}>{fmtN(s[4])}</td>
                    <td className="td-right td-dim">{s[5] ? s[5]+'mo' : '—'}</td>
                    <td className="td-right">
                      <input
                        type="number"
                        className="group-leads-input"
                        value={leadsPerStore[s[0]] || ''}
                        disabled={!isSelected}
                        onChange={e => setLeadsPerStore(p => ({...p, [s[0]]: e.target.value}))}
                        min={1}
                      />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          <div className="group-footer">
            {groupReserved ? (
              <div className="group-reserved-confirm">
                ✓ Group reservation complete — {Object.values(selectedStores).filter(Boolean).length} stores reserved for {fmtN(totalLeadsToReserve)} total leads.
                <br/><span style={{fontSize:12,color:'var(--muted)'}}>View all reservations in the Active Reservations panel below or click the status bar.</span>
              </div>
            ) : (
              <>
                <div className="group-footer-note">
                  Select stores and set lead amounts above. Each store gets its own reservation linked by a shared group ID.
                </div>
                <button
                  className="group-reserve-btn"
                  onClick={handleGroupReserve}
                  disabled={reservingGroup || Object.values(selectedStores).filter(Boolean).length === 0}
                >
                  {reservingGroup ? 'Reserving…' : `Reserve for ${Object.values(selectedStores).filter(Boolean).length} Store${Object.values(selectedStores).filter(Boolean).length !== 1 ? 's' : ''} — ${fmtN(totalLeadsToReserve)} Leads`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      {!activeGroup && !searchTerm && (
        <div className="group-empty">
          No dealer group detected for zip {searchZip}. Search for a group by name above to build a multi-store reservation.
        </div>
      )}
    </div>
  )
}



// ── PIN Manager ───────────────────────────────────────────────────────────
function PinManager({ opsUser }) {
  const [open, setOpen] = useState(false)
  const [pins, setPins] = useState(null)
  const [newPin, setNewPin] = useState('')
  const [newName, setNewName] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const ADMIN_KEY = 'ico-admin-2026'

  async function loadPins() {
    const res = await fetch(`/api/ops?adminKey=${ADMIN_KEY}`)
    const data = await res.json()
    if (data.pins) setPins(data.pins)
  }

  async function addPin() {
    if (!newPin || !newName) return
    setSaving(true)
    const res = await fetch('/api/ops', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: ADMIN_KEY, pin: newPin, name: newName })
    })
    const data = await res.json()
    if (data.ok) { setPins(data.pins); setNewPin(''); setNewName(''); setMsg('PIN added') }
    setSaving(false)
  }

  async function removePin(pin) {
    const res = await fetch('/api/ops', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ adminKey: ADMIN_KEY, pin })
    })
    const data = await res.json()
    if (data.ok) setPins(data.pins)
  }

  if (!open) return (
    <div style={{marginTop:20,borderTop:'1px solid var(--border)',paddingTop:14}}>
      <button onClick={() => { setOpen(true); loadPins() }}
        style={{fontSize:12,color:'var(--muted)',background:'none',border:'none',cursor:'pointer',padding:0}}>
        ⚙ Manage Ops PINs
      </button>
    </div>
  )

  return (
    <div style={{marginTop:20,borderTop:'1px solid var(--border)',paddingTop:14}}>
      <div style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:12,color:'var(--navy)',marginBottom:10}}>
        ⚙ Manage Ops PINs
        <button onClick={() => setOpen(false)} style={{marginLeft:10,fontSize:11,color:'var(--muted)',background:'none',border:'none',cursor:'pointer'}}>hide</button>
      </div>
      {pins && (
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,marginBottom:12}}>
          <thead><tr>
            <th style={{textAlign:'left',padding:'4px 8px',color:'var(--muted)',fontWeight:700,fontSize:10,textTransform:'uppercase'}}>PIN</th>
            <th style={{textAlign:'left',padding:'4px 8px',color:'var(--muted)',fontWeight:700,fontSize:10,textTransform:'uppercase'}}>Name</th>
            <th></th>
          </tr></thead>
          <tbody>
            {Object.entries(pins).map(([pin, name]) => (
              <tr key={pin} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'6px 8px',fontFamily:'var(--mono)',letterSpacing:3}}>{pin}</td>
                <td style={{padding:'6px 8px'}}>{name}</td>
                <td style={{padding:'6px 8px'}}>
                  <button onClick={() => removePin(pin)}
                    style={{color:'var(--red)',background:'none',border:'none',cursor:'pointer',fontSize:11}}>Remove</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <input style={{width:80,padding:'5px 8px',border:'1.5px solid var(--border)',borderRadius:5,fontFamily:'var(--mono)',fontSize:13,letterSpacing:2}}
          placeholder="PIN" maxLength={6} value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,''))} />
        <input style={{flex:1,padding:'5px 8px',border:'1.5px solid var(--border)',borderRadius:5,fontSize:13}}
          placeholder="Person name (e.g. Sarah Johnson)" value={newName} onChange={e=>setNewName(e.target.value)} />
        <button onClick={addPin} disabled={saving || !newPin || !newName}
          style={{background:'var(--navy)',color:'#fff',border:'none',borderRadius:5,padding:'5px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>
          Add
        </button>
      </div>
      {msg && <div style={{fontSize:11,color:'var(--green)',marginTop:6}}>{msg}</div>}
    </div>
  )
}

// ── ICO Ops Queue Panel ───────────────────────────────────────────────────
function OpsPanel({ reservations, onClose, onUpdated, opsActionFromUrl, opsIdFromUrl }) {
  const [pin, setPin] = useState('')
  const [opsUser, setOpsUser] = useState(null)
  const [pinError, setPinError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [actionId, setActionId] = useState(null)
  const [declineNotes, setDeclineNotes] = useState('')
  const [decliningId, setDecliningId] = useState(null)
  const [processing, setProcessing] = useState(false)

  const pending = reservations.filter(r => r.opsStatus === 'PENDING' && r.status === 'active')
  const recent = reservations.filter(r => ['APPROVED','DECLINED'].includes(r.opsStatus)).slice(-10).reverse()

  async function verifyPin() {
    if (!pin || pin.length < 4) return
    setVerifying(true); setPinError('')
    try {
      const res = await fetch(`/api/ops?pin=${pin}`)
      const data = await res.json()
      if (data.ok) {
        setOpsUser(data)
        // Auto-process if came from email with approve/decline action
        // 'review' action just shows the bar without auto-actioning
        if (opsActionFromUrl && opsIdFromUrl && opsActionFromUrl !== 'review') {
          setTimeout(() => handleAction(opsIdFromUrl, opsActionFromUrl, ''), 300)
        }
      }
      else setPinError('Invalid PIN. Please try again.')
    } catch(e) { setPinError('Connection error. Try again.') }
    setVerifying(false)
  }

  async function handleAction(reservationId, action, notes) {
    setProcessing(true)
    try {
      const res = await fetch('/api/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: opsUser.pin, reservationId, action, notes: notes || '' })
      })
      const data = await res.json()
      if (data.ok) {
        setDecliningId(null); setDeclineNotes('')
        const dealer = data.reservation?.dealerName || 'dealer'
        const msg = action === 'approve'
          ? `✓ ${dealer} approved — RSM has been notified`
          : `✗ ${dealer} declined — RSM has been notified`
        onUpdated(msg)
      }
    } catch(e) {
      console.error('Action failed:', e)
    }
    setProcessing(false)
  }

  const verdictColors = { APPROVED:'#00c896', APPROVABLE:'#f5a800', REVIEW_REQUIRED:'#f97316', DENIED:'#ff4757' }

  return (
    <div className="slideout-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="slideout-panel">
        <div className="slideout-header">
          <div>
            <div className="slideout-title">🔐 ICO Ops Queue</div>
            <div className="slideout-sub">{pending.length} pending · {recent.length} recently actioned</div>
          </div>
          <button className="slideout-close" onClick={onClose}>✕</button>
        </div>

        {!opsUser ? (
          <div style={{padding:32,display:'flex',flexDirection:'column',gap:12,maxWidth:320,margin:'0 auto'}}>
            <div style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:15,color:'var(--navy)'}}>Enter your Ops PIN</div>
            <div style={{fontSize:13,color:'var(--muted)'}}>Your PIN identifies you in the response log for reporting purposes.</div>
            <input
              className="reserve-input"
              type="password"
              placeholder="4-digit PIN"
              maxLength={6}
              value={pin}
              onChange={e => setPin(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && verifyPin()}
              autoFocus
              style={{fontSize:20,letterSpacing:6,textAlign:'center'}}
            />
            {pinError && <div style={{color:'var(--red)',fontSize:12}}>{pinError}</div>}
            <button className="reserve-submit-btn" onClick={verifyPin} disabled={verifying || pin.length < 4}>
              {verifying ? 'Verifying…' : 'Verify PIN'}
            </button>
          </div>
        ) : (
          <div className="slideout-body">
            <div style={{background:'#f0fdf4',border:'1px solid #86efac',borderRadius:7,padding:'8px 14px',marginBottom:16,fontSize:13,color:'#15803d'}}>
              ✓ Logged in as <strong>{opsUser.name}</strong>
            </div>

            {/* Pending queue */}
            <div style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:11,letterSpacing:1.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}>
              Pending Review ({pending.length})
            </div>

            {pending.length === 0 ? (
              <div style={{fontSize:13,color:'var(--muted)',fontStyle:'italic',marginBottom:24}}>No pending reservations — you're all caught up.</div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
                {pending.map(r => {
                  const vColor = verdictColors[r.verdict] || 'var(--muted)'
                  const elapsed = r.submittedAt
                    ? Math.round((Date.now() - new Date(r.submittedAt).getTime()) / 60000)
                    : null
                  return (
                    <div key={r.id} className="ops-card">
                      <div className="ops-card-header">
                        <div>
                          <div className="ops-dealer-name">{r.dealerName}</div>
                          <div className="ops-dealer-meta">{r.zip} {r.city}, {r.state} · {r.dma}</div>
                        </div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontFamily:'var(--mono)',fontWeight:700,fontSize:18,color:vColor}}>{fmtN(r.leadsReserved)}</div>
                          <div style={{fontSize:11,color:'var(--muted)'}}>leads/mo</div>
                        </div>
                      </div>
                      <div className="ops-card-meta">
                        <span className="ops-verdict-badge" style={{background:vColor+'15',color:vColor,border:`1px solid ${vColor}30`}}>
                          {r.verdict?.replace('_',' ')}
                        </span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>Score: {r.approvalScore}/10</span>
                        <span style={{fontSize:11,color:'var(--muted)'}}>By: {r.reservedBy}</span>
                        {elapsed !== null && (
                          <span style={{fontSize:11,color: elapsed > 30 ? 'var(--red)' : elapsed > 15 ? '#f5a800' : 'var(--green)', fontWeight:600}}>
                            ⏱ {elapsed}m elapsed
                          </span>
                        )}
                      </div>
                      {r.notes && <div style={{fontSize:12,color:'var(--muted)',margin:'6px 0',fontStyle:'italic'}}>"{r.notes}"</div>}

                      {decliningId === r.id ? (
                        <div style={{marginTop:8,display:'flex',flexDirection:'column',gap:6}}>
                          <input className="reserve-input" placeholder="Reason for decline (optional)"
                            value={declineNotes} onChange={e => setDeclineNotes(e.target.value)} autoFocus />
                          <div style={{display:'flex',gap:8}}>
                            <button className="ops-decline-btn" onClick={() => handleAction(r.id, 'decline', declineNotes)} disabled={processing}>
                              Confirm Decline
                            </button>
                            <button className="ops-cancel-btn" onClick={() => setDecliningId(null)}>Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="ops-actions">
                          <button className="ops-approve-btn" onClick={() => handleAction(r.id, 'approve', '')} disabled={processing}>
                            ✓ Approve
                          </button>
                          <button className="ops-decline-btn" onClick={() => setDecliningId(r.id)}>
                            ✗ Decline
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* PIN Management */}
            <PinManager opsUser={opsUser} />

            {/* Recently actioned */}
            {recent.length > 0 && (
              <>
                <div style={{fontFamily:'var(--cond)',fontWeight:700,fontSize:11,letterSpacing:1.5,textTransform:'uppercase',color:'var(--muted)',marginBottom:10}}>
                  Recently Actioned ({recent.length})
                </div>
                <table className="comp-table" style={{fontSize:12}}>
                  <thead><tr>
                    <th>Dealer</th><th>Zip</th><th className="th-r">Leads</th>
                    <th>Status</th><th>By</th><th className="th-r">Response</th>
                  </tr></thead>
                  <tbody>
                    {recent.map(r => (
                      <tr key={r.id}>
                        <td style={{fontWeight:600}}>{r.dealerName}</td>
                        <td className="td-mono">{r.zip}</td>
                        <td className="td-right td-num">{fmtN(r.leadsReserved)}</td>
                        <td style={{color: r.opsStatus === 'APPROVED' ? 'var(--green)' : 'var(--red)', fontWeight:700, fontSize:11}}>
                          {r.opsStatus}
                        </td>
                        <td className="td-dim">{r.opsRespondedBy || '—'}</td>
                        <td className="td-right td-dim">{r.elapsedMinutes !== null ? r.elapsedMinutes+'m' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}


// ── Sticky Ops Action Bar (shown when Ops arrives via email link) ─────────
function StickyOpsBar({ reservationId, action: suggestedAction, reservations, onDone }) {
  const [pin, setPin] = useState('')
  const [pinVerified, setPinVerified] = useState(false)
  const [opsUser, setOpsUser] = useState(null)
  const [pinError, setPinError] = useState('')
  const [declineMode, setDeclineMode] = useState(false)
  const [declineNotes, setDeclineNotes] = useState('')
  const [processing, setProcessing] = useState(false)
  const [done, setDone] = useState(false)

  const reservation = reservations.find(r => r.id === reservationId)
  if (!reservation) return null

  const vColors = { APPROVED:'#00c896', APPROVABLE:'#f5a800', REVIEW_REQUIRED:'#f97316', DENIED:'#ff4757' }
  const vColor = vColors[reservation.verdict] || '#f5a800'

  async function verifyPin() {
    if (!pin || pin.length < 4) return
    try {
      const res = await fetch(`/api/ops?pin=${pin}`)
      const data = await res.json()
      if (data.ok) { setOpsUser(data); setPinVerified(true) }
      else setPinError('Invalid PIN')
    } catch { setPinError('Connection error') }
  }

  async function handleAction(action, notes) {
    setProcessing(true)
    try {
      const res = await fetch('/api/ops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: opsUser.pin, reservationId, action, notes: notes || '' })
      })
      const data = await res.json()
      if (data.ok) {
        setDone(true)
        const dealer = reservation.dealerName || 'dealer'
        setTimeout(() => onDone(`${action === 'approve' ? '✓' : '✗'} ${dealer} ${action === 'approve' ? 'approved' : 'declined'} — RSM has been notified`), 1500)
      }
    } catch(e) { console.error(e) }
    setProcessing(false)
  }

  return (
    <div className="sticky-ops-bar">
      <div className="sticky-ops-inner">
        <div className="sticky-ops-info">
          <span className="sticky-ops-verdict" style={{background:vColor+'20',color:vColor,border:`1px solid ${vColor}40`}}>
            {reservation.verdict?.replace(/_/g,' ')}
          </span>
          <span className="sticky-ops-dealer">{reservation.dealerName}</span>
          <span className="sticky-ops-meta">{reservation.zip} · {fmtN(reservation.leadsReserved)} leads · Score {reservation.approvalScore}/10</span>
        </div>
        <div className="sticky-ops-right">
          {done ? (
            <div style={{color:'#00c896',fontFamily:'var(--cond)',fontWeight:700,fontSize:13}}>
              ✓ Action recorded — RSM notified
            </div>
          ) : !pinVerified ? (
            <div className="sticky-ops-pin">
              <input className="sticky-pin-input" type="password" placeholder="Enter PIN to action" autoFocus
                maxLength={6} value={pin}
                onChange={e => setPin(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && verifyPin()} />
              <button className="sticky-pin-btn" onClick={verifyPin} disabled={pin.length < 4}>Verify</button>
              {pinError && <span style={{color:'#ff6b7a',fontSize:11}}>{pinError}</span>}
            </div>
          ) : declineMode ? (
            <div className="sticky-ops-pin">
              <input className="sticky-pin-input" style={{width:180}} placeholder="Decline reason (optional)"
                value={declineNotes} onChange={e => setDeclineNotes(e.target.value)} autoFocus />
              <button className="ops-decline-btn" onClick={() => handleAction('decline', declineNotes)} disabled={processing}>
                {processing ? 'Declining…' : 'Confirm'}
              </button>
              <button className="ops-cancel-btn" onClick={() => setDeclineMode(false)}>Cancel</button>
            </div>
          ) : (
            <div className="sticky-ops-actions">
              <span style={{fontSize:11,color:'rgba(255,255,255,.5)',marginRight:4}}>as {opsUser?.name}</span>
              <button className="ops-approve-btn" onClick={() => handleAction('approve', '')} disabled={processing}>
                {processing ? '…' : '✓ Approve'}
              </button>
              <button className="ops-decline-btn" onClick={() => setDeclineMode(true)} disabled={processing}>
                ✗ Decline
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


// ── Bug 5: Data freshness footer ──────────────────────────────────────────
function DataFreshnessFooter({ dataDate: dateDateStr }) {
  const displayDate = dateDateStr || DATA_DATE
  // Parse M/D/YY format
  const parts = displayDate.split('/')
  const dataDate = parts.length === 3
    ? new Date(2000 + parseInt(parts[2]), parseInt(parts[0])-1, parseInt(parts[1]))
    : new Date('2026-03-23')
  const now = new Date()
  const daysOld = Math.floor((now - dataDate) / 86400000)
  const isStale = daysOld > 1

  return (
    <div className={`footer ${isStale ? 'footer-stale' : ''}`}>
      <span>
        Opportunity Finder OLR &amp; Dealer data as of {displayDate} · {DATA_BC_COUNT.toLocaleString()} active BCs · Ring values = best single nearby zip (not a sum)
      </span>
      {isStale && (
        <span className="stale-warning">
          ⚠ Data is {daysOld} day{daysOld !== 1 ? 's' : ''} old — refresh via ↑ Update Data
        </span>
      )}
    </div>
  )
}

// ── Enhancement: Hot Markets panel ───────────────────────────────────────
function HotMarketsPanel({ onZipClick }) {
  const [view, setView] = useState('available') // 'available' | 'whitespace' | 'over'

  const topAvail = Object.entries(dmaSaturation)
    .filter(([,s]) => s.avail > 0)
    .sort((a,b) => b[1].avail - a[1].avail)
    .slice(0, 10)

  const topOver = Object.entries(dmaSaturation)
    .filter(([,s]) => s.avail < 0)
    .sort((a,b) => a[1].avail - b[1].avail)
    .slice(0, 10)

  const topGreen = whitespaceZips.slice(0, 10)

  return (
    <div className="hot-markets-panel">
      <div className="hot-markets-header">
        <div className="hot-markets-title">Market Intelligence</div>
        <div className="hot-markets-tabs">
          <button className={`hot-tab ${view==='available'?'hot-tab-active':''}`} onClick={()=>setView('available')}>🟢 Most Available</button>
          <button className={`hot-tab ${view==='whitespace'?'hot-tab-active':''}`} onClick={()=>setView('whitespace')}>✨ Whitespace</button>
          <button className={`hot-tab ${view==='over'?'hot-tab-active':''}`} onClick={()=>setView('over')}>🔴 Over-Allocated</button>
        </div>
      </div>

      {view === 'available' && (
        <div className="hot-markets-body">
          <div className="hot-markets-desc">DMAs with the most unallocated leads — prime targets for new BC prospecting.</div>
          <table className="hot-table">
            <thead><tr><th>DMA</th><th className="th-r">Available</th><th className="th-r">Allocated</th><th className="th-r">BCs</th></tr></thead>
            <tbody>
              {topAvail.map(([dma, s]) => (
                <tr key={dma}>
                  <td className="hot-dma">{dma}</td>
                  <td className="td-right avail-pos td-num">{fmtN(s.avail)}</td>
                  <td className="td-right td-num td-dim">{fmtN(s.target)}</td>
                  <td className="td-right td-dim">{s.dealers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'whitespace' && (
        <div className="hot-markets-body">
          <div className="hot-markets-desc">Zips with high availability and no active Buying Center — untapped markets for new BC placement.</div>
          <table className="hot-table">
            <thead><tr><th>Zip</th><th>Location</th><th>DMA</th><th className="th-r">Available</th><th></th></tr></thead>
            <tbody>
              {topGreen.map(e => (
                <tr key={e.zip}>
                  <td className="td-mono">{e.zip}</td>
                  <td>{e.city}, {e.state}</td>
                  <td className="td-dim" style={{fontSize:11}}>{e.dma}</td>
                  <td className="td-right avail-pos td-num">{fmtN(e.avail)}</td>
                  <td><button className="hot-check-btn" onClick={()=>onZipClick(e.zip)}>Check</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'over' && (
        <div className="hot-markets-body">
          <div className="hot-markets-desc">Most over-allocated DMAs — exercise caution when approving new BCs here.</div>
          <table className="hot-table">
            <thead><tr><th>DMA</th><th className="th-r">Over-Allocated</th><th className="th-r">Target</th><th className="th-r">BCs</th></tr></thead>
            <tbody>
              {topOver.map(([dma, s]) => (
                <tr key={dma}>
                  <td className="hot-dma">{dma}</td>
                  <td className="td-right avail-neg td-num">{fmtN(s.avail)}</td>
                  <td className="td-right td-num td-dim">{fmtN(s.target)}</td>
                  <td className="td-right td-dim">{s.dealers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Enhancement: Tenure insight callout ──────────────────────────────────
function TenureInsight({ tenure }) {
  if (tenure === null || tenure === undefined) return null
  const isNew = tenure <= 6
  const isMid = tenure > 6 && tenure <= 24
  if (!isNew && !isMid) return null
  return (
    <div className="tenure-insight">
      {isNew
        ? <span>💡 New BC ({tenure}mo tenure) — data shows new BCs average <strong>110% of target</strong> in their first 6 months. Strong historical performance for new installs.</span>
        : <span>💡 Mid-tenure BC ({tenure}mo) — dealers at this stage average <strong>106% of target</strong>. Solid track record.</span>
      }
    </div>
  )
}



// ── Inline Market Intelligence (shown after Check result) ─────────────────
function MarketIntelligenceInline({ zip, dma, av, nearbyWhitespace }) {
  const [expanded, setExpanded] = useState(false)
  const sc = coordsMap[zip]

  // DMA rank
  const allAvail = Object.entries(dmaSaturation)
    .sort((a,b) => b[1].avail - a[1].avail)
  const dmaRank = allAvail.findIndex(([d]) => d === dma) + 1
  const totalDmas = allAvail.length
  const dmaStats = dmaSaturation[dma] || {}
  const isOverAlloc = dmaStats.avail < 0
  const rankPct = Math.round((dmaRank / totalDmas) * 100)

  // nearbyWhitespace passed as prop — computed in handleCheck alongside calcAvailability

  // DMA health label
  const dmaHealth = dmaRank <= 30 ? { label: 'High Capacity', color: 'var(--green)', icon: '🟢' }
    : dmaRank <= 100 ? { label: 'Moderate Capacity', color: '#c8860a', icon: '🟡' }
    : { label: 'Constrained Market', color: 'var(--red)', icon: '🔴' }

  return (
    <div className="mkt-inline-panel">
      <div className="mkt-inline-header" onClick={() => setExpanded(e => !e)}>
        <div className="mkt-inline-title">📊 Market Intelligence</div>
        <div className="mkt-inline-chips">
          <span className="mkt-chip" style={{color: dmaHealth.color, borderColor: dmaHealth.color + '40', background: dmaHealth.color + '10'}}>
            {dmaHealth.icon} {dma} — {dmaHealth.label} (#{dmaRank} of {totalDmas} DMAs)
          </span>
          {nearbyWhitespace.length > 0 && (
            <span className="mkt-chip mkt-chip-white">
              ✨ {nearbyWhitespace.length} whitespace zip{nearbyWhitespace.length > 1 ? 's' : ''} within 45mi
            </span>
          )}
          {av.hasUnderdeliveryWarning && (
            <span className="mkt-chip mkt-chip-warn">⚠ Underdelivery risk nearby</span>
          )}
        </div>
        <div className="mkt-inline-toggle">{expanded ? '▲' : '▼'}</div>
      </div>

      {expanded && (
        <div className="mkt-inline-body">
          <div className="mkt-inline-grid">

            {/* DMA Position */}
            <div className="mkt-intel-card">
              <div className="mkt-intel-card-title">DMA Market Position</div>
              <div className="mkt-intel-card-val" style={{color: dmaHealth.color}}>
                #{dmaRank} <span style={{fontSize:13,fontWeight:400,color:'var(--muted)'}}>of {totalDmas}</span>
              </div>
              <div className="mkt-intel-card-sub">by available leads nationally</div>
              <div className="mkt-intel-divider" />
              <div style={{fontSize:12,color:'var(--muted)',lineHeight:1.5}}>
                <strong>{dma}</strong> has <span style={{color: isOverAlloc ? 'var(--red)' : 'var(--green)', fontWeight:600}}>{fmtN(dmaStats.avail)}</span> leads {isOverAlloc ? 'over-allocated' : 'available'} across {dmaStats.dealers} active BCs with {fmtN(dmaStats.target)} leads/mo allocated.
              </div>
            </div>

            {/* Whitespace Opportunities — from useMemo above */}
            <div className="mkt-intel-card">
              <div className="mkt-intel-card-title">✨ Whitespace Within 45mi</div>
              {nearbyWhitespace.length > 0 ? (
                <>
                  <div style={{fontSize:11,color:'var(--muted)',marginBottom:6}}>{nearbyWhitespace.length} whitespace zips found</div>
                  <table className="mkt-mini-table">
                    <thead><tr><th>Zip</th><th>City</th><th className="th-r">Avail</th><th className="th-r">Dist</th></tr></thead>
                    <tbody>
                      {nearbyWhitespace.slice(0,5).map(w => (
                        <tr key={w.zip}>
                          <td className="td-mono">{w.zip}</td>
                          <td style={{fontSize:11}}>{w.city}, {w.state}</td>
                          <td className="td-right avail-pos td-num">{fmtN(w.avail)}</td>
                          <td className="td-right td-dim" style={{fontSize:11}}>{w.dist}mi</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              ) : (
                <div style={{fontSize:12,color:'var(--muted)',marginTop:8}}>No whitespace zips within 45 miles.</div>
              )}
            </div>

            {/* Competing Over-Allocated Zips */}
            <div className="mkt-intel-card">
              <div className="mkt-intel-card-title">🔴 Competing Pressure Within 30mi</div>
              <div style={{fontSize:11,color:'var(--muted)',marginBottom:8,lineHeight:1.4}}>Over-allocated BC zips nearby — their deficits compete with the same consumer pool.</div>
              {(() => {
                if (!sc) return <div style={{fontSize:12,color:'var(--muted)'}}>No coordinate data.</div>
                const competing = Object.keys(dmaSaturation).length > 0
                  ? av.ring15.concat(av.ring30)
                      .filter(e => e.rawAvail < 0 && e.hasBC)
                      .sort((a,b) => a.avail - b.avail)
                      .slice(0, 5)
                  : []
                if (!competing.length) return <div style={{fontSize:12,color:'var(--green)'}}>✓ No significantly over-allocated BCs within 30 miles.</div>
                return (
                  <table className="mkt-mini-table">
                    <thead><tr><th>Zip</th><th>Dealer</th><th className="th-r">Deficit</th><th className="th-r">Dist</th></tr></thead>
                    <tbody>
                      {competing.map(e => (
                        <tr key={e.zip}>
                          <td className="td-mono">{e.zip}</td>
                          <td style={{fontSize:11,maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.name}</td>
                          <td className="td-right avail-neg td-num">{fmtN(e.rawAvail)}</td>
                          <td className="td-right td-dim" style={{fontSize:11}}>{e.dist}mi</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )
              })()}
            </div>

            {/* Real Demand Card */}
            <div className="mkt-intel-card">
              <div className="mkt-intel-card-title">📊 Real Market Demand ({OFFER_MONTH})</div>
              {(() => {
                if (!sc) return <div style={{fontSize:12,color:'var(--muted)'}}>No coordinate data.</div>
                // Sum offers within each radius
                let o15=0, o30=0, o45=0
                Object.entries(offerMap).forEach(([z, cnt]) => {
                  const zc = coordsMap[z]
                  if (!zc) return
                  const dist = haversine(sc[0], sc[1], zc[0], zc[1])
                  if (dist <= 15) o15 += cnt
                  if (dist <= 30) o30 += cnt
                  if (dist <= 45) o45 += cnt
                })
                const leads15 = Math.round(o15 * 2)
                const leads30 = Math.round(o30 * 2)
                const leads45 = Math.round(o45 * 2)
                return (
                  <div>
                    <div style={{fontSize:11,color:'var(--muted)',marginBottom:10,lineHeight:1.4}}>
                      Actual consumer offers in this market at 2x LPO:
                    </div>
                    <table className="mkt-mini-table">
                      <thead><tr><th>Radius</th><th className="th-r">Offers</th><th className="th-r">Est. Leads</th></tr></thead>
                      <tbody>
                        <tr><td>0–15 mi</td><td className="td-right td-num">{fmtN(o15)}</td><td className="td-right avail-pos td-num">{fmtN(leads15)}</td></tr>
                        <tr><td>0–30 mi</td><td className="td-right td-num">{fmtN(o30)}</td><td className="td-right avail-pos td-num">{fmtN(leads30)}</td></tr>
                        <tr><td>0–45 mi</td><td className="td-right td-num">{fmtN(o45)}</td><td className="td-right avail-pos td-num">{fmtN(leads45)}</td></tr>
                      </tbody>
                    </table>
                    <div style={{fontSize:11,color:'var(--muted)',marginTop:8,lineHeight:1.4}}>
                      MAT uses 3x assumption. Real demand at 2x confirms actual capacity.
                    </div>
                  </div>
                )
              })()}
            </div>

          </div>
        </div>
      )}
    </div>
  )
}

// ── Enhancement: Tenure insight for searched zip's dealer ────────────────
function TenureInsightForZip({ dma, searchZip }) {
  const dealers = dealerMap[dma] || []
  const dealer = dealers.find(d => d[0] === searchZip)
  if (!dealer) return null
  return <TenureInsight tenure={dealer[10]} />
}

function NameForm({ onSave }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,marginTop:8}}>
      <input className="reserve-input" placeholder="Your full name" value={name}
        onChange={e=>setName(e.target.value)} autoFocus />
      <input className="reserve-input" placeholder="Work email (for approval notifications)"
        value={email} onChange={e=>setEmail(e.target.value)}
        onKeyDown={e=>e.key==='Enter'&&name.trim()&&onSave(name,email)} />
      <button className="reserve-submit-btn" disabled={!name.trim()}
        onClick={() => onSave(name, email)}>Get Started</button>
    </div>
  )
}

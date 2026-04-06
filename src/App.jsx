import React, { useState, useEffect, useCallback } from 'react'
import * as XLSX from 'xlsx'
import { calcAvailability, getZipInfo, fmtN, fmtPct, LPO } from './utils'
import { fetchReservations, createReservation, cancelReservation, daysUntil, fmtDate } from './api'
import { dealerMap } from './dealerMap'
import { KBB_LOGO_B64 } from './kbbLogo'
import { coordsMap } from './coordsMap'
import { haversine } from './utils'
import { whitespaceZips, dmaSaturation, DATA_DATE, DATA_BC_COUNT } from './marketData'
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
function ReserveBox({ zipInfo, desired, reserved, onReserved, sellerName }) {
  const [checked, setChecked] = useState(false)
  const [leads, setLeads] = useState(desired || '')
  const [dealer, setDealer] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  const [error, setError] = useState('')
  const [confirmingDuplicate, setConfirmingDuplicate] = useState(false)

  // Reset all state when zip changes
  useEffect(() => {
    setConfirmed(null)
    setChecked(false)
    setDealer('')
    setNotes('')
    setError('')
    setLeads(desired || '')
    setConfirmingDuplicate(false)
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

  const expires = new Date(Date.now() + 14 * 86400000)

  async function submit() {
    if (!leads || leads < 1) { setError('Enter a valid lead amount.'); return }
    if (!dealer.trim()) { setError('Dealer name is required.'); return }
    setError(''); setLoading(true)
    try {
      const res = await createReservation({
        zip: zipInfo.zip, city: zipInfo.city, state: zipInfo.state, dma: zipInfo.dma,
        leadsReserved: parseInt(leads), dealerName: dealer.trim(),
        notes: notes.trim(), reservedBy: sellerName || 'Unknown'
      })
      setConfirmed(res)
      onReserved()
    } catch(e) {
      setError(e.message)
    }
    setLoading(false)
  }

  if (confirmed) return (
    <div className="reserve-box">
      <div className="reserve-confirmed">
        <div className="reserve-confirmed-icon">✓</div>
        <div style={{flex:1}}>
          <strong>{fmtN(confirmed.leadsReserved)} leads reserved</strong> for {confirmed.dealerName} in zip {confirmed.zip}
          <br /><span style={{fontSize:12,color:'var(--muted)'}}>Expires {fmtDate(confirmed.expiresAt)} · ID: {confirmed.id.slice(-8)}</span>
        </div>
        <button
          className="res-cancel-btn"
          style={{marginLeft:16,flexShrink:0}}
          onClick={async () => {
            await cancelReservation(confirmed.id)
            setConfirmed(null)
            setChecked(false)
            onReserved()
          }}
        >Release</button>
      </div>
      <div style={{fontSize:12,color:'var(--muted)',marginTop:10,padding:'8px 12px',background:'#f8f9fc',borderRadius:6,lineHeight:1.5}}>
        Changed your mind later? Scroll down to the <strong>Active Reservations</strong> panel and click <strong>Release</strong> next to this entry — leads return to availability immediately.
      </div>
    </div>
  )

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

      {checked && (
        <div style={{marginTop:12}}>
          <div className="reserve-fields">
            <div className="reserve-field">
              <label className="reserve-field-label">Dealer Name *</label>
              <input className="reserve-input" value={dealer} onChange={e=>setDealer(e.target.value)} placeholder="e.g. World Car Nissan" />
            </div>
            <div className="reserve-field" style={{maxWidth:140}}>
              <label className="reserve-field-label">Lead Amount *</label>
              <input className="reserve-input" type="number" value={leads} onChange={e=>setLeads(e.target.value)} min={1} placeholder="200" />
            </div>
          </div>
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
              <button className="reserve-submit-btn" onClick={submit} disabled={loading}>
                {loading ? 'Saving…' : 'Confirm Reservation'}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}


// ── Reservation Slideout — DMA filtered view ─────────────────────────────
function ReservationSlideout({ reservations, onCancel, onClose, onRefresh }) {
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
                        <button className="res-cancel-btn" onClick={() => onCancel(r.id)}>
                          Release
                        </button>
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
function ReservationsPanel({ reservations, onCancel, onRefresh }) {
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
              <th>Reserved</th><th>Expires</th><th></th>
            </tr>
          </thead>
          <tbody>
            {active.map(r => <ReservationRow key={r.id} r={r} onCancel={onCancel} />)}
            {expired.length > 0 && (
              <tr className="av-section"><td colSpan={9}>Expired ({expired.length})</td></tr>
            )}
            {expired.map(r => <ReservationRow key={r.id} r={r} onCancel={null} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReservationRow({ r, onCancel }) {
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
      <td className="td-mono td-dim">{fmtDate(r.reservedAt)}</td>
      <td className={urgency}>
        {r.status === 'active'
          ? <>{fmtDate(r.expiresAt)}{days <= 7 && <span className="res-days"> ({days}d)</span>}</>
          : <span className={`res-status-${r.status}`}>{r.status.toUpperCase()}</span>
        }
      </td>
      <td>
        {onCancel && r.status === 'active' && (
          <button className="res-cancel-btn" onClick={() => onCancel(r.id)}>Release</button>
        )}
      </td>
    </tr>
  )
}

// ── Dealer table ───────────────────────────────────────────────────────────
function DealerTable({ dma, searchZip }) {
  const cm = coordsMap
  const dealers = dealerMap[dma] || []
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
              <th colSpan={10}></th>
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
              <td colSpan={8} className="tf-label">DMA TOTALS</td>
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
  function setMsg(k, m, t) { setMsgs(p => ({...p, [k]: {m, t}})) }

  function handleFile(ft, file) {
    if (!file) return
    setMsg(ft, 'Processing…', 'info')
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array'})
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:null})
        const today = new Date().toLocaleDateString('en-US', {month:'numeric',day:'numeric',year:'2-digit'})
        setMsg(ft, `✓ ${rows.length.toLocaleString()} rows loaded — data date updated to ${today}`, 'success')
        if (ft === 'mat' && onDataUpdated) onDataUpdated(today)
      } catch(err) {
        setMsg(ft, '✗ ' + err.message, 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const rows = [
    { key:'mat', label:'Opportunity Finder OLR', badge:'DAILY', badgeColor:'#dc2626', desc:'Download daily from Power BI (e.g. Opportunity Finder OLR_3_23.xlsx). Contains zip-level available leads and BC targets.' },
    { key:'dealer', label:'Dealer Export', badge:'AS NEEDED', badgeColor:'#c8860a', desc:'Export when BCs are added or cancelled (e.g. Dealer_Export.xlsx).' },
    { key:'list', label:'Dealer List (Performance)', badge:'MONTHLY', badgeColor:'var(--muted)', desc:'Export the Dealer List tab monthly for updated leads delivered and % of target.' },
    { key:'lms', label:'Local Market Sheet', badge:'AS NEEDED', badgeColor:'#7c3aed', desc:'Export from Power BI for a specific zip + radius. Used to validate real consumer offer volume and confirm market demand before approval.' },
  ]

  return (
    <div className="import-modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="import-modal">
        <div className="import-modal-title">Update Data</div>
        <div className="import-modal-sub">Data files are built into the app at deployment time. To refresh with new exports, update the source files and redeploy via GitHub. The notes below show which file to replace for each data type.</div>
        {rows.map(({key, label, badge, badgeColor, desc}) => (
          <div key={key} className="import-row">
            <div className="import-row-title">
              {label} <span style={{color:badgeColor,fontSize:10,marginLeft:6}}>{badge}</span>
            </div>
            <div className="import-row-desc">{desc}</div>
            <div className="import-file-row">
              <label className="imp-btn" style={{cursor:'pointer'}}>
                Choose File
                <input type="file" accept=".xlsx,.xls" style={{display:'none'}} onChange={e => handleFile(key, e.target.files[0])} />
              </label>
              {msgs[key] && <span className={`imp-msg imp-msg-${msgs[key].t}`}>{msgs[key].m}</span>}
            </div>
          </div>
        ))}
        <div className="import-modal-footer">
          <div className="import-footer-note">Files are processed locally — nothing is uploaded.</div>
          <button className="import-close-btn" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────
export default function App() {
  const [zip, setZip] = useState('')
  const [desired, setDesired] = useState('')
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
  const [dataDate, setDataDate] = useState(() => {
    return localStorage.getItem('ico_data_date') || DATA_DATE
  })
  const [showNamePrompt, setShowNamePrompt] = useState(false)
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

  // Ask for seller name once
  useEffect(() => {
    if (!sellerName) setShowNamePrompt(true)
  }, [sellerName])

  function saveName(name) {
    const n = name.trim()
    if (n) { setSellerName(n); localStorage.setItem('ico_seller_name', n) }
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
    const info = getZipInfo(z)
    if (!info) { setError(`Zip code ${z} was not found in the current dataset.`); return }
    const av = calcAvailability(z, reservations)
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
        verdict='REVIEW REQUIRED'; vClass='caution'; vIcon='~'
      } else {
        // Which ring covers the request?
        const bestCovering = best15 >= des ? best15 : best30 >= des ? best30 : best45
        const coveringRing = best15 >= des ? 15 : best30 >= des ? 30 : 45
        const overageRatio = bestCovering > 0 ? baseOverage / bestCovering : Infinity
        const innerEmpty = best15 === 0 && best30 === 0
        if (coveringRing <= 30 && overageRatio <= 1.5) {
          verdict='APPROVABLE'; vClass='caution'; vIcon='~'
        } else {
          verdict='REVIEW REQUIRED'; vClass='caution'; vIcon='~'
        }
      }
    } else {
      if (base > 0)        { verdict='AVAILABLE';  vClass='approve'; vIcon='✓' }
      else if (best15 > 0) { verdict=hasUnderdeliveryWarning?'REVIEW REQUIRED':'BOOSTABLE'; vClass='caution'; vIcon='~' }
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

      {showModal && <UpdateModal onClose={() => setShowModal(false)} onDataUpdated={date => { setDataDate(date); localStorage.setItem('ico_data_date', date) }} />}

      <header>
        <img src={`data:image/png;base64,${KBB_LOGO_B64}`} alt="KBB 100 Years" style={{height:48,width:'auto'}} />
        <h1>ICO Intelligence</h1>
        {sellerName && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,.4)'}}>{sellerName}</span>
            <button className="mkt-intel-btn" onClick={() => setShowMarkets(m => !m)}>📊 Market Intel</button>
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

      {showResSlideout && (
        <ReservationSlideout
          reservations={reservations}
          onCancel={handleCancel}
          onClose={() => setShowResSlideout(false)}
          onRefresh={loadReservations}
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
          if (base === null) recText = 'Availability data missing. Contact ICO Operations.'
          else if (des) {
            if (base >= des)          recText = `Zip ${info.zip} has <strong>${fmtN(base)} leads available</strong> in its own pool — enough to support your requested ${fmtN(des)} leads/mo. Approvable on base availability alone.`
            else if (av.best15 >= des) recText = `Base availability (${fmtN(base)}) is below your requested ${fmtN(des)}, but a neighboring zip within 15 miles has <strong>${fmtN(av.best15)} available</strong> — enough to justify approval with the 0–15 mi booster.`
            else if (av.best30 >= des) recText = `Base and 0–15 mi availability fall short, but a zip in the 15–30 mi band has <strong>${fmtN(av.best30)} available</strong> — a case can be made to ICO Ops.`
            else if (av.best45 >= des) recText = `Only the 30–45 mi ring shows availability. With a base overage of ${fmtN(Math.abs(base))} and no inner-ring headroom, this requires <strong>manual ICO Ops review</strong> — not a standard approval. Submit with the booster zip and let Ops assess the radius overlap.`
            else                       recText = `Even at 45 miles, max nearby availability is <strong>${fmtN(av.best45)}</strong> — below your requested ${fmtN(des)}. This market cannot support the request at this time.`
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
                  <div className="badge-label">{verdict}</div>
                </div>
                <div className="loc">
                  <div className="loc-name">{info.city}, {info.state} <span className="loc-zip">{info.zip}</span></div>
                  <div className="loc-sub">15-Mile Radius · {isBC ? 'Active Buying Center' : 'No Active Buying Center'}</div>
                  <div className="dma-tag">{info.dma}</div>
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
                />
              )}

              <MarketExtensionCard searchZip={info.zip} searchCoords={coordsMap[info.zip]} />
              <TenureInsightForZip dma={info.dma} searchZip={info.zip} />
              <DealerTable dma={info.dma} searchZip={info.zip} />
              <ZipNotes zip={info.zip} sellerName={sellerName} />

              <DataFreshnessFooter dataDate={dataDate} />
            </>
          )
        })()}

        <ReservationsPanel
          reservations={reservations}
          onCancel={handleCancel}
          onRefresh={loadReservations}
        />
      </main>
    </>
  )
}




// ── Approval Likelihood Score ─────────────────────────────────────────────
function calcApprovalScore(av, desired, dmaRank, totalDmas) {
  if (!desired || desired === 0) return null
  const { base, best15, best30, best45, hasUnderdeliveryWarning } = av
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

  const score = Math.round(Math.min(10, Math.max(1, f1 + f2 + f3 + f4 + f5)))

  const bands = [
    [9, 10, 'Strong',  '#00c896', 'Strong approval candidate — base availability covers the request with healthy market headroom.'],
    [7,  8, 'Good',    '#4ade80', 'Good candidate — inner ring availability supports the request. Present to ICO Ops with confidence.'],
    [5,  6, 'Fair',    '#f5a800', 'Approvable with context — availability exists but market constraints require ICO Ops review.'],
    [3,  4, 'Weak',    '#f97316', 'Weak candidate — significant overage or outer-ring-only coverage makes approval difficult.'],
    [1,  2, 'Poor',    '#ff4757', 'Unlikely to approve — insufficient availability even with ring boosters.'],
  ]
  const band = bands.find(([lo, hi]) => score >= lo && score <= hi) || bands[4]

  return { score, label: band[2], color: band[3], rationale: band[4], f1, f2, f3, f4, f5 }
}

function ApprovalScoreCard({ av, desired, dmaRank, totalDmas }) {
  const result = calcApprovalScore(av, desired, dmaRank, totalDmas)
  if (!result) return null
  const { score, label, color, rationale, f1, f2, f3, f4, f5 } = result
  const [showBreakdown, setShowBreakdown] = useState(false)

  const factors = [
    { name: 'Base Availability', val: f1, max: 3 },
    { name: 'Ring Coverage',     val: f2, max: 3 },
    { name: 'Overage Ratio',     val: f3, max: 2 },
    { name: 'DMA Health',        val: f4, max: 1 },
    { name: 'Delivery Trend',    val: f5, max: 1 },
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
  const [val, setVal] = useState('')
  return (
    <div style={{display:'flex',gap:8,marginTop:8}}>
      <input className="reserve-input" style={{flex:1}} placeholder="Your name" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSave(val)} autoFocus />
      <button className="reserve-submit-btn" onClick={() => onSave(val)}>Save</button>
    </div>
  )
}

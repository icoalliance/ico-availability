import React, { useState, useEffect, useCallback, useRef } from 'react'
import * as XLSX from 'xlsx'
import { calcAvailability, getZipInfo, fmtN, fmtPct, LPO } from './utils'
import { fetchReservations, createReservation, cancelReservation, daysUntil, fmtDate } from './api'
import { dealerMap } from './dealerMap'
import { KBB_LOGO_B64 } from './kbbLogo'
import { coordsMap } from './coordsMap'
import { haversine } from './utils'

// ── Small helpers ──────────────────────────────────────────────────────────
const pctClass = p => !p ? '' : p >= 1 ? 'pct-green' : p >= 0.75 ? 'pct-yellow' : 'pct-red'
const availColor = v => v > 0 ? 'av-pos' : v < 0 ? 'av-neg' : ''
const numClass = v => v > 0 ? 'val-green' : v < 0 ? 'val-red' : ''

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
          <div className="ring-sublabel">{subLabel(bz15)}</div>
          <div className="ring-max"><Tag val={best15} desired={desired} /></div>
        </div>

        {/* Card 3: 15-30mi */}
        <div className={`ring-card ${best30 > 0 ? 'ring-boost2' : 'ring-neg'}`}>
          <div className="ring-label">15 – 30 mi <span className="ring-count">({n30} zips)</span></div>
          <div className={`ring-avail ${best30 > 0 ? 'av-pos' : 'av-neg'}`}>{fmtN(best30)}</div>
          <div className="ring-sublabel">{subLabel(bz30)}</div>
          <div className="ring-max"><Tag val={best30} desired={desired} /></div>
        </div>

        {/* Card 4: 30-45mi */}
        <div className={`ring-card ${best45 > 0 ? 'ring-boost3' : 'ring-neg'}`}>
          <div className="ring-label">30 – 45 mi <span className="ring-count">({n45} zips)</span></div>
          <div className={`ring-avail ${best45 > 0 ? 'av-pos' : 'av-neg'}`}>{fmtN(best45)}</div>
          <div className="ring-sublabel">{subLabel(bz45)}</div>
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
              {ring15.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} />)}
              {ring30.filter(e=>e.avail>0).length > 0 && <tr className="av-section"><td colSpan={3}>15–30 mi ({n30} zips)</td></tr>}
              {ring30.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} />)}
              {ring45.filter(e=>e.avail>0).length > 0 && <tr className="av-section"><td colSpan={3}>30–45 mi ({n45} zips)</td></tr>}
              {ring45.filter(e=>e.avail>0).map(e => <ZipRow key={e.zip} e={e} />)}
            </tbody>
          </table>
        </details>
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

function ZipRow({ e }) {
  return (
    <tr className="av-detail">
      <td className="av-indent">
        {e.dist}mi · {e.zip} · {e.name}
        {e.hasBC && <span className="bc-pill">BC</span>}
      </td>
      <td className="av-num av-pos">{fmtN(e.avail)}</td>
      <td className="av-note">
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

  return (
    <div className="reserve-box">
      <div className="reserve-title">Reserve Leads</div>
      {totalReservedHere > 0 && (
        <div className="reserve-existing">
          {fmtN(totalReservedHere)} leads already reserved in this zip
        </div>
      )}
      <label className="reserve-check-label">
        <input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />
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
          {error && <div style={{color:'var(--red)',fontSize:12,marginBottom:8}}>{error}</div>}
          <button className="reserve-submit-btn" onClick={submit} disabled={loading}>
            {loading ? 'Saving…' : 'Confirm Reservation'}
          </button>
        </div>
      )}
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
function UpdateModal({ onClose }) {
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
        setMsg(ft, `✓ Loaded ${rows.length.toLocaleString()} rows — refresh the page to apply`, 'success')
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
  ]

  return (
    <div className="import-modal-overlay open" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="import-modal">
        <div className="import-modal-title">Update Data</div>
        <div className="import-modal-sub">Load fresh exports to update availability and dealer data. The Opportunity Finder OLR should be refreshed daily.</div>
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
  const [showNamePrompt, setShowNamePrompt] = useState(false)
  // coordsMap imported below

  const loadReservations = useCallback(async () => {
    try {
      const data = await fetchReservations()
      setReservations(data)
    } catch(e) {
      console.error('Could not load reservations:', e)
    }
    setResLoading(false)
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

  function handleCheck() {
    setError(''); setResult(null)
    let z = zip.trim()
    while (z.length < 5) z = '0' + z
    if (!/^\d{4,5}$/.test(zip.trim())) { setError('Please enter a valid 4 or 5-digit zip code.'); return }
    const info = getZipInfo(z)
    if (!info) { setError(`Zip code ${z} was not found in the current dataset.`); return }
    const av = calcAvailability(z, reservations)
    const des = desired ? parseInt(desired, 10) : null
    setResult({ info, av, desired: des })
  }

  async function handleCancel(id) {
    await cancelReservation(id)
    await loadReservations()
    // Re-run check with updated reservations
    if (result) {
      const av = calcAvailability(result.info.zip, await fetchReservations())
      setResult(r => ({...r, av}))
    }
  }

  async function onReserved() {
    await loadReservations()
    if (result) {
      const fresh = await fetchReservations()
      setReservations(fresh)
      const av = calcAvailability(result.info.zip, fresh)
      setResult(r => ({...r, av}))
    }
  }

  // Determine verdict
  let verdict = null, vClass = 'caution', vIcon = '~'
  if (result) {
    const { base, best15, best30, best45 } = result.av
    const des = result.desired
    if (base === null)         { verdict='UNKNOWN';    vClass='caution'; vIcon='?' }
    else if (des !== null) {
      if (base >= des)         { verdict='APPROVED';   vClass='approve'; vIcon='✓' }
      else if (best15 >= des)  { verdict='APPROVABLE'; vClass='caution'; vIcon='~' }
      else if (best30 >= des)  { verdict='APPROVABLE'; vClass='caution'; vIcon='~' }
      else if (best45 >= des)  { verdict='APPROVABLE'; vClass='caution'; vIcon='~' }
      else                     { verdict='DENIED';     vClass='deny';    vIcon='✗' }
    } else {
      if (base > 0)            { verdict='AVAILABLE';  vClass='approve'; vIcon='✓' }
      else if (best15 > 0)     { verdict='BOOSTABLE';  vClass='caution'; vIcon='~' }
      else                     { verdict='OVERSOLD';   vClass='deny';    vIcon='✗' }
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

      {showModal && <UpdateModal onClose={() => setShowModal(false)} />}

      <header>
        <img src={`data:image/png;base64,${KBB_LOGO_B64}`} alt="KBB 100 Years" style={{height:48,width:'auto'}} />
        <h1>ICO Lead Availability Checker</h1>
        {sellerName && (
          <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:12}}>
            <span style={{fontFamily:'var(--mono)',fontSize:11,color:'rgba(255,255,255,.4)'}}>{sellerName}</span>
            <button className="import-trigger-btn" onClick={() => setShowModal(true)}>↑ Update Data</button>
          </div>
        )}
      </header>

      <div className="import-bar">
        <div id="importStatus" style={{fontSize:11,color:'rgba(255,255,255,.4)',fontFamily:'var(--mono)'}}>
          {resLoading ? 'Loading reservations…' : `${reservations.filter(r=>r.status==='active').length} active reservation(s)`}
        </div>
      </div>

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
            else if (av.best45 >= des) recText = `Extending to 45 miles finds <strong>${fmtN(av.best45)} available</strong>. ICO Ops would need to map the overlap to approve at this range.`
            else                       recText = `Even at 45 miles, max nearby availability is <strong>${fmtN(av.best45)}</strong> — below your requested ${fmtN(des)}. Consider a smaller target or different zip.`
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

              <DealerTable dma={info.dma} searchZip={info.zip} />

              <div className="footer">
                Opportunity Finder OLR &amp; Dealer data as of 3/23/26 · 3,039 active BCs · Ring values = best single nearby zip (not a sum)
              </div>
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

function NameForm({ onSave }) {
  const [val, setVal] = useState('')
  return (
    <div style={{display:'flex',gap:8,marginTop:8}}>
      <input className="reserve-input" style={{flex:1}} placeholder="Your name" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&onSave(val)} autoFocus />
      <button className="reserve-submit-btn" onClick={() => onSave(val)}>Save</button>
    </div>
  )
}

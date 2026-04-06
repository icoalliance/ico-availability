import { matMap } from './matMap'
import { coordsMap } from './coordsMap'
import { dealerMap } from './dealerMap'

export const LPO = { jan: 2.0, feb: 2.1, mar: 2.0, current: 2.0, month: "Mar '26" }

export function haversine(lat1, lon1, lat2, lon2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
}

// Build O(1) dealer lookup once
const dealerByZip = {}
Object.values(dealerMap).forEach(arr => {
  arr.forEach(d => { if (!dealerByZip[d[0]]) dealerByZip[d[0]] = d })
})

// Underdelivery: 2+ of last 3 complete months (Dec/Jan/Feb) below 80%
function checkUnderdelivery(de) {
  if (!de) return { flag: false, months: [] }
  const pct = de[12] || [null,null,null,null]
  const labels = ['Dec','Jan','Feb']
  const under = []
  for (let m = 0; m < 3; m++) {
    if (pct[m] !== null && pct[m] < 0.80) under.push(`${labels[m]} ${Math.round(pct[m]*100)}%`)
  }
  return { flag: under.length >= 2, months: under }
}

export function calcAvailability(zip, reservations = []) {
  const rec = matMap[zip]
  if (!rec) return null

  const sc = coordsMap[zip]
  const baseRaw = rec[4]

  // Deduct active reservations from base
  const totalReserved = reservations
    .filter(r => r.zip === zip && r.status === 'active')
    .reduce((s, r) => s + r.leadsReserved, 0)
  const base = baseRaw !== null ? baseRaw - totalReserved : null

  // When base is negative, the zip is over-allocated by this amount.
  // Neighboring zip radii heavily overlap, so that overage eats into their pools.
  // ICO Ops nets this out: neighbor_approvable = neighbor_avail - base_overage
  // Applied within 30mi (heavy overlap zone); beyond 30mi radii are more independent.
  const baseOverage = (base !== null && base < 0) ? Math.abs(base) : 0

  if (!sc) return { base, best15:0, best30:0, best45:0, ring15:[], ring30:[], ring45:[], reserved:totalReserved, baseOverage }

  const ring15 = [], ring30 = [], ring45 = []
  const keys = Object.keys(matMap)

  for (const z of keys) {
    if (z === zip) continue
    const mr = matMap[z]
    const rawAvail = mr[4]
    if (rawAvail === null || rawAvail === undefined) continue
    const zc = coordsMap[z]
    if (!zc) continue
    const dist = haversine(sc[0], sc[1], zc[0], zc[1])
    if (dist > 45) continue

    const de = dealerByZip[z] || null

    // Overdelivery (most recent complete month Dec=0/Jan=1/Feb=2)
    let odExcess = 0, odMonth = null, odPct = null
    if (de) {
      const leads = de[11] || [null,null,null,null]
      const pct   = de[12] || [null,null,null,null]
      for (let m = 2; m >= 0; m--) {
        if (leads[m] !== null && pct[m] !== null) {
          if (pct[m] > 1.0) { odExcess = leads[m]-(de[5]||0); odMonth=['Dec','Jan','Feb'][m]; odPct=pct[m] }
          break
        }
      }
    }

    const ud = checkUnderdelivery(de)

    // Netted availability: subtract base overage within 30mi (heavy overlap zone)
    const nettedAvail = dist <= 30 ? rawAvail - baseOverage : rawAvail

    const entry = {
      zip:z, name:de?de[1]:`${mr[0]}, ${mr[1]}`,
      dist:Math.round(dist*10)/10,
      rawAvail, avail:nettedAvail,
      hasBC:mr[3]!==null && mr[3]!==undefined,
      odExcess, odMonth, odPct,
      underdelivery:ud.flag, underMonths:ud.months
    }

    if (dist <= 15) ring15.push(entry)
    else if (dist <= 30) ring30.push(entry)
    else ring45.push(entry)
  }

  ring15.sort((a,b) => a.dist-b.dist)
  ring30.sort((a,b) => a.dist-b.dist)
  ring45.sort((a,b) => a.dist-b.dist)

  const best = ring => ring.reduce((m,e) => e.avail>m ? e.avail : m, 0)
  const bestZip = ring => ring.filter(e=>e.avail>0).reduce((b,e)=>(!b||e.avail>b.avail)?e:b, null)

  const bz15=bestZip(ring15), bz30=bestZip(ring30), bz45=bestZip(ring45)
  const hasUnderdeliveryWarning = [bz15,bz30,bz45].some(bz=>bz&&bz.underdelivery)
  const underdeliveryCount = [...ring15,...ring30,...ring45].filter(e=>e.underdelivery&&e.avail>0).length

  return {
    base, baseOverage,
    best15:best(ring15), best30:best(ring30), best45:best(ring45),
    ring15, ring30, ring45,
    reserved:totalReserved,
    hasUnderdeliveryWarning, underdeliveryCount
  }
}

export function getZipInfo(zip) {
  const rec = matMap[zip]
  if (!rec) return null
  return { zip, city:rec[0], state:rec[1], dma:rec[2], target:rec[3], avail:rec[4] }
}

export function fmtN(n) {
  if (n===null||n===undefined) return '—'
  return Number(n).toLocaleString()
}

export function fmtPct(p) {
  if (p===null||p===undefined) return '—'
  return Math.round(p*100)+'%'
}

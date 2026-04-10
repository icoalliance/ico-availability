import { Redis } from '@upstash/redis'
import * as XLSX from 'xlsx'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export const config = { api: { bodyParser: { sizeLimit: '10mb' } } }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { rows, fileData, fileType, fileName } = req.body
    if (!fileType) return res.status(400).json({ error: 'Missing fileType' })

    let parsedRows = rows
    // Fallback: if rows not provided, decode base64 (legacy support)
    if (!parsedRows && fileData) {
      const buffer = Buffer.from(fileData, 'base64')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      parsedRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    }
    if (!parsedRows) return res.status(400).json({ error: 'Missing rows or fileData' })
    // Use parsedRows throughout (avoids redeclaring 'parsedRows')

    const today = new Date().toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'2-digit' })

    if (fileType === 'mat') {
      // Parse Opportunity Finder OLR
      // Columns: DMACode, ZipCode, Radius, City, State, DMA, LeadsSold, Available
      const matMap = {}
      let curDMA = ''
      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i]
        const dmaCol = row[5] ? String(row[5]).trim().toUpperCase() : ''
        if (dmaCol && dmaCol !== 'NAN') curDMA = dmaCol
        const zr = row[1]
        if (!zr && zr !== 0) continue
        let z
        try { z = String(parseInt(zr)).padStart(5, '0') } catch { continue }
        if (z.length !== 5) continue
        const city = row[3] ? String(row[3]).trim() : ''
        const state = row[4] ? String(row[4]).trim() : ''
        let target = null, avail = null
        try { if (row[6] !== null) target = parseInt(String(row[6]).replace(/,/g,'')) } catch {}
        try { if (row[7] !== null) avail = parseInt(String(row[7]).replace(/,/g,'')) } catch {}
        matMap[z] = [city, state, curDMA, target || null, avail !== undefined ? avail : null]
      }

      // Store in Redis chunks (800KB each to stay under 1MB limit)
      const json = JSON.stringify(matMap)
      const chunkSize = 800 * 1024
      const chunks = []
      for (let i = 0; i < json.length; i += chunkSize) {
        chunks.push(json.slice(i, i + chunkSize))
      }
      for (let i = 0; i < chunks.length; i++) {
        await kv.set(`ico_mat_chunk_${i}`, chunks[i])
      }
      await kv.set('ico_mat_meta', { 
        chunks: chunks.length, 
        zips: Object.keys(matMap).length,
        date: today,
        fileName,
        updatedAt: new Date().toISOString()
      })

      return res.status(200).json({ 
        ok: true, type: 'mat', 
        zips: Object.keys(matMap).length, 
        date: today, chunks: chunks.length 
      })
    }

    if (fileType === 'dealer') {
      // Parse Dealer Export using known fixed column positions
      // Columns: SVOC(0), BC Status(1), Group(2), Dealer(3), Product Name(4),
      //          Rate(5), Market Rates(6), DAT Target(7), Dealer Zip(8), 
      //          Available Leads(9), Dealer DMA(10), Code(11)
      const headers = parsedRows[0] ? parsedRows[0].map(h => h ? String(h).toLowerCase().trim() : '') : []
      
      // Use exact column name matching with fallback to position
      const findCol = (exact, fallbackIdx) => {
        const idx = headers.findIndex(h => h === exact)
        return idx >= 0 ? idx : fallbackIdx
      }
      const zipIdx    = findCol('dealer zip', 8)
      const nameIdx   = findCol('dealer', 3)
      const groupIdx  = findCol('group', 2)
      const dmaIdx    = findCol('dealer dma', 10)
      const rateIdx   = findCol('rate', 5)
      const mktIdx    = findCol('market rates', 6)
      const targetIdx = findCol('dat target', 7)
      const availIdx  = findCol('available leads', 9)
      const svocIdx   = findCol('svoc', 0)

      const dealerMap = {}
      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i]
        if (!row[zipIdx] && row[zipIdx] !== 0) continue
        let z
        try { z = String(parseInt(String(row[zipIdx]).replace(/[^0-9]/g,''))).padStart(5,'0') } catch { continue }
        if (z.length !== 5 || z === '00000') continue
        
        const dma = dmaIdx >= 0 && row[dmaIdx] 
          ? String(row[dmaIdx]).trim().toUpperCase() 
          : 'UNKNOWN'
        if (!dealerMap[dma]) dealerMap[dma] = []
        
        const parseNum = (v) => { try { return v !== null && v !== undefined && v !== '' ? parseInt(String(v).replace(/[^0-9-]/g,'')) || null : null } catch { return null } }

        dealerMap[dma].push([
          z,
          nameIdx >= 0 && row[nameIdx] ? String(row[nameIdx]).trim() : '',
          groupIdx >= 0 && row[groupIdx] ? String(row[groupIdx]).trim() : '',
          rateIdx >= 0 && row[rateIdx] ? String(row[rateIdx]).trim() : '',
          mktIdx >= 0 && row[mktIdx] ? String(row[mktIdx]).trim() : '',
          targetIdx >= 0 ? parseNum(row[targetIdx]) : null,
          availIdx >= 0 ? parseNum(row[availIdx]) : null,
          svocIdx >= 0 && row[svocIdx] ? String(row[svocIdx]).trim() : '',
          null, null, null, null, null
        ])
      }

      // Store as object directly (not pre-stringified) to avoid double-encoding
      await kv.set('ico_dealer_data', dealerMap)
      await kv.set('ico_dealer_meta', {
        dmas: Object.keys(dealerMap).length,
        dealers: Object.values(dealerMap).flat().length,
        date: today, fileName,
        updatedAt: new Date().toISOString()
      })

      // Auto-activation: scan active reservations for SVOC matches
      let activated = 0
      try {
        const reservations = await kv.get('ico_reservations') || []
        // Build a set of all SVOCs in the new dealer export
        const activeSvocs = new Set()
        const svocToEntry = {}
        for (const entries of Object.values(dealerMap)) {
          for (const entry of entries) {
            const svoc = entry[7]
            if (svoc) {
              activeSvocs.add(String(svoc).trim())
              svocToEntry[String(svoc).trim()] = entry
            }
          }
        }

        let changed = false
        for (let i = 0; i < reservations.length; i++) {
          const r = reservations[i]
          if (r.status !== 'active' && r.status !== 'expired') continue
          if (r.opsStatus !== 'APPROVED' && r.opsStatus !== 'PENDING') continue
          if (!r.svoc) continue

          const svoc = String(r.svoc).trim()
          if (activeSvocs.has(svoc)) {
            reservations[i] = {
              ...r,
              status: 'activated',
              activatedAt: new Date().toISOString(),
              activatedViaSvoc: svoc,
            }
            activated++
            changed = true
          }
        }

        if (changed) await kv.set('ico_reservations', reservations)
      } catch(e) {
        console.error('Auto-activation check failed:', e)
      }

      return res.status(200).json({
        ok: true, type: 'dealer',
        dmas: Object.keys(dealerMap).length,
        dealers: Object.values(dealerMap).flat().length,
        activated,
        date: today
      })
    }

    if (fileType === 'dealerList') {
      // Parse Dealer List — monthly performance data
      // Store as zip -> [dec, jan, feb, mar] leads and pcts
      let headerRow = 0
      for (let i = 0; i < Math.min(5, parsedRows.length); i++) {
        if (parsedRows[i].some(v => v && String(v).toLowerCase().includes('zip'))) {
          headerRow = i; break
        }
      }
      const headers = parsedRows[headerRow].map(h => h ? String(h).toLowerCase().trim() : '')
      const zipIdx = headers.findIndex(h => h.includes('zip'))

      const perfMap = {}
      for (let i = headerRow + 1; i < parsedRows.length; i++) {
        const row = parsedRows[i]
        if (!row[zipIdx]) continue
        let z
        try { z = String(parseInt(row[zipIdx])).padStart(5,'0') } catch { continue }
        // Collect monthly columns (look for month-like headers)
        const monthData = []
        for (let j = 0; j < headers.length; j++) {
          if (headers[j].match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/)) {
            monthData.push(row[j] ? parseInt(String(row[j]).replace(/,/g,'')) || null : null)
          }
        }
        if (monthData.length) perfMap[z] = monthData
      }

      // Store as object directly (not pre-stringified)
      await kv.set('ico_perf_data', perfMap)
      await kv.set('ico_perf_meta', { 
        zips: Object.keys(perfMap).length,
        date: today, fileName,
        updatedAt: new Date().toISOString()
      })

      return res.status(200).json({ 
        ok: true, type: 'dealerList',
        zips: Object.keys(perfMap).length,
        date: today 
      })
    }

    return res.status(400).json({ error: `Unknown fileType: ${fileType}` })

  } catch(e) {
    console.error('Upload error:', e)
    return res.status(500).json({ error: e.message })
  }
}

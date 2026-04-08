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
    const { fileData, fileType, fileName } = req.body
    if (!fileData || !fileType) return res.status(400).json({ error: 'Missing fileData or fileType' })

    // Decode base64 file
    const buffer = Buffer.from(fileData, 'base64')
    const wb = XLSX.read(buffer, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })

    const today = new Date().toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'2-digit' })

    if (fileType === 'mat') {
      // Parse Opportunity Finder OLR
      // Columns: DMACode, ZipCode, Radius, City, State, DMA, LeadsSold, Available
      const matMap = {}
      let curDMA = ''
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]
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
      // Parse Dealer Export — build dealerMap grouped by DMA
      // Find header row
      let headerRow = 0
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].some(v => v && String(v).toLowerCase().includes('zip'))) {
          headerRow = i; break
        }
      }
      const headers = rows[headerRow].map(h => h ? String(h).toLowerCase().trim() : '')
      const zipIdx = headers.findIndex(h => h.includes('zip'))
      const nameIdx = headers.findIndex(h => h.includes('dealer') || h.includes('name'))
      const groupIdx = headers.findIndex(h => h.includes('group'))
      const dmaIdx = headers.findIndex(h => h.includes('dma'))
      const svocIdx = headers.findIndex(h => h.includes('svoc') || h.includes('revenue'))
      const tenureIdx = headers.findIndex(h => h.includes('tenure'))
      const rateIdx = headers.findIndex(h => h.includes('rate') && !h.includes('mkt'))
      const mktRateIdx = headers.findIndex(h => h.includes('mkt'))
      const targetIdx = headers.findIndex(h => h.includes('target'))
      const availIdx = headers.findIndex(h => h.includes('avail'))

      const dealerMap = {}
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row[zipIdx]) continue
        let z
        try { z = String(parseInt(row[zipIdx])).padStart(5,'0') } catch { continue }
        const dma = row[dmaIdx] ? String(row[dmaIdx]).trim().toUpperCase() : 'UNKNOWN'
        if (!dealerMap[dma]) dealerMap[dma] = []
        dealerMap[dma].push([
          z,
          row[nameIdx] ? String(row[nameIdx]).trim() : '',
          row[groupIdx] ? String(row[groupIdx]).trim() : '',
          row[svocIdx] ? String(row[svocIdx]).trim() : '',
          row[rateIdx] ? String(row[rateIdx]).trim() : '',
          row[targetIdx] ? parseInt(String(row[targetIdx]).replace(/,/g,'')) || null : null,
          row[availIdx] ? parseInt(String(row[availIdx]).replace(/,/g,'')) || null : null,
          row[svocIdx] ? String(row[svocIdx]).trim() : '',
          null, null,
          row[tenureIdx] ? parseInt(row[tenureIdx]) || null : null,
          null, null
        ])
      }

      const json = JSON.stringify(dealerMap)
      await kv.set('ico_dealer_data', json)
      await kv.set('ico_dealer_meta', { 
        dmas: Object.keys(dealerMap).length,
        dealers: Object.values(dealerMap).flat().length,
        date: today, fileName,
        updatedAt: new Date().toISOString()
      })

      return res.status(200).json({ 
        ok: true, type: 'dealer',
        dmas: Object.keys(dealerMap).length,
        dealers: Object.values(dealerMap).flat().length,
        date: today 
      })
    }

    if (fileType === 'dealerList') {
      // Parse Dealer List — monthly performance data
      // Store as zip -> [dec, jan, feb, mar] leads and pcts
      let headerRow = 0
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        if (rows[i].some(v => v && String(v).toLowerCase().includes('zip'))) {
          headerRow = i; break
        }
      }
      const headers = rows[headerRow].map(h => h ? String(h).toLowerCase().trim() : '')
      const zipIdx = headers.findIndex(h => h.includes('zip'))

      const perfMap = {}
      for (let i = headerRow + 1; i < rows.length; i++) {
        const row = rows[i]
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

      const json = JSON.stringify(perfMap)
      await kv.set('ico_perf_data', json)
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

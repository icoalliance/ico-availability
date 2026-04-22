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
    const body = req.body
    const { fileType, fileName } = body
    if (!fileType) return res.status(400).json({ error: 'Missing fileType' })

    const today = new Date().toLocaleDateString('en-US', { month:'numeric', day:'numeric', year:'2-digit' })

    // ── Dealer chunk upload ──────────────────────────────────────────────────
    if (fileType === 'dealer') {
      const { dealerMap: chunkMap, chunkIndex } = body
      if (!chunkMap || typeof chunkMap !== 'object') {
        return res.status(400).json({ error: 'Missing dealerMap chunk' })
      }
      await kv.set(`ico_dealer_chunk_${chunkIndex}`, chunkMap)
      return res.status(200).json({ ok: true, chunk: chunkIndex, dmas: Object.keys(chunkMap).length })
    }

    // ── Dealer finalize ──────────────────────────────────────────────────────
    if (fileType === 'dealer_finalize') {
      const { totalDealers, totalDmas, totalChunks: sentChunks } = body
      // Count how many chunks were stored
      const numChunks = sentChunks || 20
      await kv.set('ico_dealer_meta', {
        dmas: totalDmas || 0,
        dealers: totalDealers || 0,
        chunks: numChunks,
        date: today, fileName, updatedAt: new Date().toISOString()
      })

      return res.status(200).json({
        ok: true, type: 'dealer',
        dmas: totalDmas || 0,
        dealers: totalDealers || 0,
        date: today
      })
    }

    // ── OLR and Dealer List — require rows ───────────────────────────────────
    let parsedRows = body.rows
    if (!parsedRows && body.fileData) {
      const buffer = Buffer.from(body.fileData, 'base64')
      const wb = XLSX.read(buffer, { type: 'buffer' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      parsedRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null })
    }
    if (!parsedRows) return res.status(400).json({ error: 'Missing rows or fileData' })

    // ── OLR Upload ───────────────────────────────────────────────────────────
    if (fileType === 'mat') {
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
      const json = JSON.stringify(matMap)
      const chunkSize = 800 * 1024
      const chunks = []
      for (let i = 0; i < json.length; i += chunkSize) chunks.push(json.slice(i, i + chunkSize))
      for (let i = 0; i < chunks.length; i++) await kv.set(`ico_mat_chunk_${i}`, chunks[i])
      await kv.set('ico_mat_meta', { chunks: chunks.length, zips: Object.keys(matMap).length, date: today, fileName, updatedAt: new Date().toISOString() })
      return res.status(200).json({ ok: true, type: 'mat', zips: Object.keys(matMap).length, date: today, chunks: chunks.length })
    }

    // ── Dealer List Upload ───────────────────────────────────────────────────
    if (fileType === 'dealerList') {
      let headerRow = 0
      for (let i = 0; i < Math.min(5, parsedRows.length); i++) {
        if (parsedRows[i].some(v => v && String(v).toLowerCase().includes('zip'))) { headerRow = i; break }
      }
      const headers = parsedRows[headerRow].map(h => h ? String(h).toLowerCase().trim() : '')
      const zipIdx = headers.findIndex(h => h.includes('zip'))
      const perfMap = {}
      for (let i = headerRow + 1; i < parsedRows.length; i++) {
        const row = parsedRows[i]
        if (!row[zipIdx]) continue
        let z
        try { z = String(parseInt(row[zipIdx])).padStart(5,'0') } catch { continue }
        const monthData = []
        for (let j = 0; j < headers.length; j++) {
          if (headers[j].match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/)) {
            monthData.push(row[j] ? parseInt(String(row[j]).replace(/,/g,'')) || null : null)
          }
        }
        if (monthData.length) perfMap[z] = monthData
      }
      await kv.set('ico_perf_data', perfMap)
      await kv.set('ico_perf_meta', { zips: Object.keys(perfMap).length, date: today, fileName, updatedAt: new Date().toISOString() })
      return res.status(200).json({ ok: true, type: 'dealerList', zips: Object.keys(perfMap).length, date: today })
    }

    return res.status(400).json({ error: `Unknown fileType: ${fileType}` })

  } catch(e) {
    console.error('Upload error:', e)
    return res.status(500).json({ error: e.message })
  }
}

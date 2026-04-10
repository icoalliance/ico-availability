import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const KEY = 'ico_reservations'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, PATCH, PUT, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  if (req.method === 'GET') {
    try {
      const all = await kv.get(KEY) || []
      const now = Date.now()
      const updated = all.map(r => ({
        ...r,
        status: r.status === 'active' && new Date(r.expiresAt).getTime() < now ? 'expired' : r.status
      }))
      return res.status(200).json(updated)
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  if (req.method === 'POST') {
    try {
      const body = req.body
      const now = new Date()
      const expires = new Date(now.getTime() + 14 * 86400000)

      const reservation = {
        id: `res_${Date.now()}_${Math.random().toString(36).substr(2,5)}`,
        zip: body.zip,
        city: body.city || '',
        state: body.state || '',
        dma: body.dma || '',
        leadsReserved: body.leadsReserved,
        dealerName: body.dealerName || '',
        notes: body.notes || '',
        reservedBy: body.reservedBy || 'Unknown',
        reservedByEmail: body.reservedByEmail || '',
        status: 'active',
        createdAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        // Ops workflow fields
        verdict: body.verdict || null,
        approvalScore: body.approvalScore || null,
        submittedToOps: false,
        submittedAt: ['APPROVED','APPROVABLE','REVIEW_REQUIRED'].includes(body.verdict) 
          ? now.toISOString() : null,
        opsStatus: body.verdict === 'APPROVED' ? 'APPROVED' 
                 : body.verdict === 'DENIED' ? 'DENIED' 
                 : body.verdict ? 'PENDING' : null,
        opsRespondedAt: null,
        opsRespondedBy: null,
        opsNotes: null,
        elapsedMinutes: null,
        groupId: body.groupId || null,
        svoc: body.svoc || null,
      }

      const all = await kv.get(KEY) || []
      all.push(reservation)
      await kv.set(KEY, all)
      return res.status(200).json(reservation)
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body
      const all = await kv.get(KEY) || []
      const updated = all.filter(r => r.id !== id)
      await kv.set(KEY, updated)
      return res.status(200).json({ ok: true })
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  // PUT — RSM edit reservation
  if (req.method === 'PUT') {
    try {
      const { id, dealerName, leadsReserved, notes, bcType, dealerType, hasCrm,
              inventorySize, currentDealerTarget, verdict, approvalScore,
              scoreBreakdown, nearbyBCNote, marketTier, tierMinLeads } = req.body
      const all = await kv.get(KEY) || []
      const idx = all.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ error: 'Not found' })

      const existing = all[idx]
      // Reset ops status if lead amount or dealer changed — needs re-review
      const needsReReview = dealerName !== existing.dealerName || leadsReserved !== existing.leadsReserved
      const newOpsStatus = needsReReview ? 'PENDING' : existing.opsStatus

      all[idx] = {
        ...existing,
        dealerName: dealerName || existing.dealerName,
        leadsReserved: leadsReserved || existing.leadsReserved,
        notes: notes !== undefined ? notes : existing.notes,
        bcType: bcType || existing.bcType,
        dealerType: dealerType || existing.dealerType,
        hasCrm: hasCrm !== undefined ? hasCrm : existing.hasCrm,
        inventorySize: inventorySize !== undefined ? inventorySize : existing.inventorySize,
        currentDealerTarget: currentDealerTarget !== undefined ? currentDealerTarget : existing.currentDealerTarget,
        verdict: verdict || existing.verdict,
        approvalScore: approvalScore !== undefined ? approvalScore : existing.approvalScore,
        scoreBreakdown: scoreBreakdown || existing.scoreBreakdown,
        nearbyBCNote: nearbyBCNote !== undefined ? nearbyBCNote : existing.nearbyBCNote,
        marketTier: marketTier || existing.marketTier,
        tierMinLeads: tierMinLeads || existing.tierMinLeads,
        opsStatus: newOpsStatus,
        // Reset ops response if needs re-review
        opsRespondedAt: needsReReview ? null : existing.opsRespondedAt,
        opsRespondedBy: needsReReview ? null : existing.opsRespondedBy,
        submittedToOps: needsReReview ? false : existing.submittedToOps,
        submittedAt: needsReReview ? new Date().toISOString() : existing.submittedAt,
        svoc: body.svoc !== undefined ? body.svoc : existing.svoc,
        editedAt: new Date().toISOString(),
      }
      await kv.set(KEY, all)
      return res.status(200).json(all[idx])
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  // PATCH — ops approve/decline
  if (req.method === 'PATCH') {
    try {
      const { id, opsStatus, opsNotes, opsRespondedBy } = req.body
      const all = await kv.get(KEY) || []
      const idx = all.findIndex(r => r.id === id)
      if (idx === -1) return res.status(404).json({ error: 'Not found' })

      const r = all[idx]
      const respondedAt = new Date().toISOString()
      const elapsed = r.submittedAt 
        ? Math.round((new Date(respondedAt) - new Date(r.submittedAt)) / 60000)
        : null

      all[idx] = {
        ...r,
        opsStatus,
        opsNotes: opsNotes || null,
        opsRespondedAt: respondedAt,
        opsRespondedBy: opsRespondedBy || null,
        elapsedMinutes: elapsed,
      }
      await kv.set(KEY, all)
      return res.status(200).json(all[idx])
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

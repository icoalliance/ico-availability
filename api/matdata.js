import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { type } = req.query

    if (type === 'mat') {
      const meta = await kv.get('ico_mat_meta')
      if (!meta) return res.status(404).json({ error: 'No mat data in Redis' })
      
      // Fetch all chunks in parallel
      const chunkKeys = Array.from({ length: meta.chunks }, (_, i) => `ico_mat_chunk_${i}`)
      const chunks = await Promise.all(chunkKeys.map(k => kv.get(k)))
      
      // Reassemble
      const json = chunks.join('')
      const matMap = JSON.parse(json)
      
      return res.status(200).json({ matMap, meta })
    }

    if (type === 'dealer') {
      const meta = await kv.get('ico_dealer_meta')
      if (!meta) return res.status(404).json({ error: 'No dealer data in Redis' })
      // Assemble dealer map from chunks (stored as ico_dealer_chunk_0..N)
      const dealerMap = {}
      const numChunks = meta.chunks || 20
      for (let i = 0; i < numChunks; i++) {
        const chunk = await kv.get(`ico_dealer_chunk_${i}`)
        if (!chunk) break
        Object.assign(dealerMap, chunk)
      }
      return res.status(200).json({ dealerMap, meta })
    }

    if (type === 'meta') {
      const matMeta = await kv.get('ico_mat_meta')
      const dealerMeta = await kv.get('ico_dealer_meta')
      const perfMeta = await kv.get('ico_perf_meta')
      return res.status(200).json({ mat: matMeta, dealer: dealerMeta, perf: perfMeta })
    }

    return res.status(400).json({ error: 'Missing type param (mat|dealer|meta)' })
  } catch(e) {
    console.error('matdata error:', e)
    return res.status(500).json({ error: e.message })
  }
}

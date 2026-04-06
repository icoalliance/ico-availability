import { Redis } from '@upstash/redis'

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const zip = req.method === 'GET' ? req.query.zip : req.body?.zip
  if (!zip) return res.status(400).json({ error: 'zip required' })

  const KEY = `ico_notes_${zip}`

  if (req.method === 'GET') {
    try {
      const notes = await kv.get(KEY) || []
      return res.status(200).json(notes)
    } catch(e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method === 'POST') {
    try {
      const { text, author, createdAt } = req.body
      if (!text) return res.status(400).json({ error: 'text required' })
      const note = {
        id: `note_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        zip, text, author: author || 'Unknown',
        createdAt: createdAt || new Date().toISOString()
      }
      const existing = await kv.get(KEY) || []
      existing.unshift(note)
      await kv.set(KEY, existing)
      return res.status(200).json(note)
    } catch(e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { noteId } = req.body
      const existing = await kv.get(KEY) || []
      const updated = existing.filter(n => n.id !== noteId)
      await kv.set(KEY, updated)
      return res.status(200).json({ ok: true })
    } catch(e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}

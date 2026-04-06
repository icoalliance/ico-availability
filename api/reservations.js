import { Redis } from '@upstash/redis';
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const RESERVATION_DAYS = 14;

  if (req.method === 'GET') {
    try {
      const reservations = await kv.get('ico_reservations') || [];
      const now = Date.now();
      // Auto-expire
      let changed = false;
      reservations.forEach(r => {
        if (r.status === 'active' && now > new Date(r.expiresAt).getTime()) {
          r.status = 'expired';
          changed = true;
        }
      });
      if (changed) await kv.set('ico_reservations', reservations);
      return res.status(200).json(reservations);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const { zip, city, state, dma, leadsReserved, dealerName, notes, reservedBy } = req.body;
      if (!zip || !leadsReserved || !dealerName) {
        return res.status(400).json({ error: 'zip, leadsReserved, and dealerName are required' });
      }
      const now = new Date();
      const expires = new Date(now.getTime() + RESERVATION_DAYS * 24 * 60 * 60 * 1000);
      const reservation = {
        id: 'res_' + now.getTime() + '_' + Math.random().toString(36).substr(2, 6),
        zip, city, state, dma,
        leadsReserved: parseInt(leadsReserved),
        dealerName, notes: notes || '',
        reservedBy: reservedBy || 'Unknown',
        reservedAt: now.toISOString(),
        expiresAt: expires.toISOString(),
        status: 'active'
      };
      const existing = await kv.get('ico_reservations') || [];
      existing.push(reservation);
      await kv.set('ico_reservations', existing);
      return res.status(200).json(reservation);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const { id } = req.body;
      const reservations = await kv.get('ico_reservations') || [];
      reservations.forEach(r => { if (r.id === id) r.status = 'cancelled'; });
      await kv.set('ico_reservations', reservations);
      return res.status(200).json({ ok: true });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

import { Redis } from '@upstash/redis'
const kv = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })

export default async function handler(req, res) {
  // Reset ops pins to default (2580)
  await kv.del('ico_ops_pins')
  const pins = await kv.get('ico_ops_pins')
  return res.status(200).json({ ok: true, message: 'ico_ops_pins cleared — default PIN 2580 is now active', remaining: pins })
}

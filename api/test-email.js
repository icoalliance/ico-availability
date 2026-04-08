export default async function handler(req, res) {
  const RESEND_KEY = process.env.RESEND_API_KEY

  if (!RESEND_KEY) {
    return res.status(200).json({ ok: false, error: 'RESEND_API_KEY not set in environment' })
  }

  try {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_KEY}`
      },
      body: JSON.stringify({
        from: 'ICO Intelligence <onboarding@resend.dev>',
        to: ['brian.fox@coxautoinc.com'],
        subject: 'ICO Intelligence — Email Test',
        html: '<h2>✓ Email is working!</h2><p>If you received this, the Resend integration is configured correctly.</p>'
      })
    })

    const data = await result.json()
    return res.status(200).json({ 
      ok: result.ok, 
      status: result.status,
      resend_response: data,
      key_prefix: RESEND_KEY.substring(0, 8) + '...'
    })
  } catch(e) {
    return res.status(500).json({ ok: false, error: e.message })
  }
}

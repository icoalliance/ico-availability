const API = '/api/reservations'

export async function fetchReservations() {
  const res = await fetch(API)
  if (!res.ok) throw new Error('Failed to load reservations')
  return res.json()
}

export async function createReservation(data) {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  if (!res.ok) {
    const err = await res.json()
    throw new Error(err.error || 'Failed to create reservation')
  }
  return res.json()
}

export async function cancelReservation(id) {
  const res = await fetch(API, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  if (!res.ok) throw new Error('Failed to cancel reservation')
  return res.json()
}

export function daysUntil(isoStr) {
  return Math.ceil((new Date(isoStr).getTime() - Date.now()) / 86400000)
}

export function fmtDate(isoStr) {
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

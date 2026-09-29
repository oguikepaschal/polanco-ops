import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'
import { normalizeNigerianPhone, isValidNigerianPhone } from '@/lib/formatters'
import { parseExchangeRate } from '@/lib/validations/exchangeRate'

// Exactly the keys SettingsClient writes. Anything else is rejected, so this
// route can't be used to plant arbitrary rows in the settings table.
const ALLOWED_KEYS = new Set([
  'business_name',
  'business_address',
  'whatsapp_number',
  'proforma_validity_hours',
  'twilio_notify_number',
  'exchange_rate_usd_ngn',
  'exchange_rate_updated_at',
])

const MAX_VALUE_LENGTH = 500

/**
 * Admin-only: save business settings.
 *
 * settings is only writable through this route — RLS grants signed-in users
 * no write policy on it. whatsapp_number decides where every new lead's name
 * and phone are sent, and the exchange rate feeds deal pricing, so the same
 * validation SettingsClient runs is repeated here rather than trusted.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: { updates?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates = body.updates
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const rows: { key: string; value: string }[] = []
  for (const [key, raw] of Object.entries(updates)) {
    if (!ALLOWED_KEYS.has(key) || typeof raw !== 'string' || raw.length > MAX_VALUE_LENGTH) {
      return NextResponse.json({ error: `Invalid setting: ${key}` }, { status: 400 })
    }

    let value = raw
    if (key === 'whatsapp_number' && value.trim()) {
      value = normalizeNigerianPhone(value)
      if (!isValidNigerianPhone(value)) {
        return NextResponse.json(
          { error: 'Enter a valid Nigerian number, e.g. +2348012345678' },
          { status: 400 }
        )
      }
    }
    if (key === 'exchange_rate_usd_ngn' && parseExchangeRate(value) === null) {
      return NextResponse.json({ error: 'Invalid exchange rate.' }, { status: 400 })
    }
    if (key === 'exchange_rate_updated_at' && Number.isNaN(Date.parse(value))) {
      return NextResponse.json({ error: 'Invalid timestamp.' }, { status: 400 })
    }

    rows.push({ key, value })
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: 'No settings to save.' }, { status: 400 })
  }

  const { error } = await createServiceClient().from('settings').upsert(rows)
  if (error) {
    console.error('Settings save failed:', error)
    return NextResponse.json({ error: 'Failed to save settings.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

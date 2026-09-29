import { createServiceClient } from '@/lib/supabase/service'
import { normalizeNigerianPhone } from '@/lib/formatters'

// DB-backed rate limiter for the public showcase enquiry endpoint. No Redis or
// external service — it reuses the existing `leads` table to spot recent
// submissions. Two independent limits over the same 5-minute window:
//   - per normalized phone: 1 enquiry. Stops accidental double-taps, permissive
//     enough that a real buyer who mistyped their number and retries isn't
//     locked out.
//   - per client IP (stored hashed as leads.ip_hash): IP_MAX_PER_WINDOW
//     enquiries. The phone limit alone is bypassed by rotating numbers; this
//     caps that. Kept above 1 because Nigerian mobile carriers put many
//     subscribers behind one CGNAT address.
const WINDOW_SECONDS = 300
const IP_MAX_PER_WINDOW = 5

export async function checkRateLimit(
  phone: string,
  ipHash: string | null
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  const normalizedPhone = normalizeNigerianPhone(phone)
  const windowStart = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString()

  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from('leads')
      .select('id')
      .eq('phone', normalizedPhone)
      .eq('source', 'website')
      .gt('created_at', windowStart)
      .limit(1)

    // Fail open: a rate-limiter failure must never block a genuine enquiry.
    if (error) {
      console.error('Rate limiter query failed (failing open):', error)
      return { allowed: true }
    }

    if (data && data.length > 0) {
      return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
    }

    // No IP available (e.g. local dev without a proxy) — phone limit only.
    if (!ipHash) return { allowed: true }

    const { count, error: ipError } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('ip_hash', ipHash)
      .gt('created_at', windowStart)

    if (ipError) {
      console.error('Rate limiter IP query failed (failing open):', ipError)
      return { allowed: true }
    }

    if ((count ?? 0) >= IP_MAX_PER_WINDOW) {
      return { allowed: false, retryAfterSeconds: WINDOW_SECONDS }
    }

    return { allowed: true }
  } catch (err) {
    console.error('Rate limiter error (failing open):', err)
    return { allowed: true }
  }
}

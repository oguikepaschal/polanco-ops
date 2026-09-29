import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Admin-only: invite a new staff member by email.
 *
 * Uses the service-role client's `auth.admin.inviteUserByEmail`, which MUST run
 * server-side only. Supabase sends its standard invitation email; the profile
 * row is created by the existing on-signup trigger (role defaults to 'staff'),
 * and we backfill full_name from the invite metadata so the staff list shows a
 * real name immediately rather than the raw email.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: { email?: unknown; full_name?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const fullName =
    typeof body.full_name === 'string' && body.full_name.trim()
      ? body.full_name.trim()
      : null

  // Minimal email shape check — Supabase validates authoritatively, this just
  // avoids a pointless round-trip on obviously empty/garbage input.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { error: 'A valid email address is required.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

  const { data, error } = await service.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: appUrl ? `${appUrl}/login` : undefined,
  })

  if (error) {
    // Most common case: the email is already registered/invited. Surface a
    // clear message instead of a silent failure or a duplicate row.
    const alreadyExists =
      error.status === 422 ||
      /already|registered|exists/i.test(error.message)
    // Provider error text stays server-side — it can carry internal detail
    // the client has no use for.
    if (!alreadyExists) console.error('inviteUserByEmail failed:', error)
    return NextResponse.json(
      {
        error: alreadyExists
          ? 'That email has already been invited or registered.'
          : 'Failed to send invitation.',
      },
      { status: alreadyExists ? 409 : 500 }
    )
  }

  // Ensure full_name is set even if the signup trigger ignores metadata. The
  // trigger runs inside the auth.users insert, so the profile row already
  // exists by the time inviteUserByEmail resolves.
  if (fullName && data.user) {
    await service
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', data.user.id)
  }

  return NextResponse.json({ success: true }, { status: 201 })
}

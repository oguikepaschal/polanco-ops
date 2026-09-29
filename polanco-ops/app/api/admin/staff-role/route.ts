import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createServiceClient } from '@/lib/supabase/service'

/**
 * Admin-only: promote or demote a staff member.
 *
 * profiles.role is only writable through this route. RLS no longer lets any
 * signed-in user update profiles (the old profiles_update_own policy let a
 * staff member set their own role to 'admin'), so the write goes through the
 * service-role client after requireAdmin() has verified the caller.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  let body: { userId?: unknown; role?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const userId = typeof body.userId === 'string' ? body.userId : ''
  const role = body.role === 'admin' || body.role === 'staff' ? body.role : null

  if (!userId || !role) {
    return NextResponse.json({ error: 'Missing userId or role' }, { status: 400 })
  }

  // Server-side counterpart to the UI hiding the control on the admin's own
  // row — an admin demoting themselves could leave the business with none.
  if (userId === auth.userId) {
    return NextResponse.json(
      { error: 'You cannot change your own role.' },
      { status: 400 }
    )
  }

  const service = createServiceClient()
  const { data, error } = await service
    .from('profiles')
    .update({ role })
    .eq('id', userId)
    .select('id')

  if (error) {
    console.error('Role update failed:', error)
    return NextResponse.json({ error: 'Failed to update role.' }, { status: 500 })
  }

  if (!data || data.length === 0) {
    return NextResponse.json({ error: 'Staff member not found.' }, { status: 404 })
  }

  return NextResponse.json({ success: true, role })
}

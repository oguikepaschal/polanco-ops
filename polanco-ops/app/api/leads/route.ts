import { NextRequest, NextResponse } from 'next/server'
import * as Sentry from '@sentry/nextjs'
import { createClient } from '@/lib/supabase/server'
import { sendWhatsAppNotification } from '@/lib/whatsapp'
import { logActivity } from '@/lib/activity/log'
import { toDisplayCase } from '@/lib/formatters'
import { leadSchema } from '@/lib/validations/lead.schema'

export async function POST(request: NextRequest) {
  const supabase = await createClient()

  // Auth check
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()

    // Validate with Zod (applies phone normalization)
    const parsed = leadSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const values = parsed.data

    // Create the lead
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .insert({
        ...values,
        email: values.email || null,
        assigned_to: values.assigned_to || null,
        last_contacted: new Date().toISOString(),
      })
      .select()
      .single()

    if (leadError) throw leadError

    // Record the new lead in the activity feed. logActivity never throws, so a
    // logging failure can't break the (already-saved) lead creation.
    await logActivity(supabase, {
      actor_id: user.id,
      action_type: 'lead_created',
      entity_type: 'lead',
      entity_id: lead.id,
      description: `New lead: ${lead.name}${lead.car_interest ? ` — ${toDisplayCase(lead.car_interest)}` : ''}`,
    })

    // NOTE: Twilio Sandbox requires recipient phones to opt in first.
    // Each test number must send "join [keyword]" to whatsapp:+14155238886.
    // In production with an approved WhatsApp Business API number, this is not required.

    // Fire notifications — never let this block the response. Collected
    // rather than thrown: sendWhatsAppNotification catches everything
    // internally and returns { success: false }, so a try/catch around
    // these calls alone can never observe a failure — that gap is exactly
    // why the last outage's Twilio failures went unnoticed.
    let notificationError: string | null = null
    try {
      // Get settings for Bash's number
      const { data: settings } = await supabase
        .from('settings')
        .select('key, value')

      const settingsMap = Object.fromEntries(
        (settings ?? []).map((s) => [s.key, s.value])
      )

      const bashNumber = settingsMap.whatsapp_number
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''

      const carText = values.car_interest ? ` (${values.car_interest})` : ''
      const message = `🚗 New lead at Polanco:\n\n*${values.name}*${carText}\n📞 ${values.phone}\nSource: ${values.source}\n\n${appUrl}/leads/${lead.id}`

      // Notify Bash
      if (bashNumber) {
        const result = await sendWhatsAppNotification(bashNumber, message)
        if (!result.success) {
          notificationError = result.error ?? 'Failed to notify primary WhatsApp number'
        }
      }

      // Notify assigned rep (if different from Bash's number)
      if (values.assigned_to) {
        const { data: assignedProfile } = await supabase
          .from('profiles')
          .select('phone')
          .eq('id', values.assigned_to)
          .single()

        if (assignedProfile?.phone && assignedProfile.phone !== bashNumber) {
          const result = await sendWhatsAppNotification(assignedProfile.phone, message)
          if (!result.success) {
            notificationError = notificationError ?? (result.error ?? 'Failed to notify assigned rep')
          }
        }
      }
    } catch (err) {
      notificationError = err instanceof Error ? err.message : 'Unknown notification error'
    }

    if (notificationError) {
      console.error('Notification failed (lead still saved):', notificationError)
      Sentry.captureMessage('WhatsApp lead notification failed', {
        level: 'warning',
        extra: { leadId: lead.id, error: notificationError },
      })
    }

    // The raw Twilio error (phone numbers, account detail) is logged above and
    // sent to Sentry; the client only needs to know the send didn't happen.
    return NextResponse.json(
      {
        lead,
        notificationError: notificationError
          ? 'Lead saved, but the WhatsApp notification failed.'
          : null,
      },
      { status: 201 }
    )
  } catch (err) {
    console.error('Create lead error:', err)
    return NextResponse.json(
      { error: 'Failed to create lead' },
      { status: 500 }
    )
  }
}

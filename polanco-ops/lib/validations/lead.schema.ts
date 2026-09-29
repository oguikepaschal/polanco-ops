import { z } from 'zod'
import { normalizeNigerianPhone, isPlausiblePhoneNumber } from '@/lib/formatters'
import { ALL_LEAD_SOURCES } from '@/lib/supabase/types'

export const leadSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
  phone: z
    .string()
    .min(1, 'Phone is required')
    .transform((val) => normalizeNigerianPhone(val))
    // Same minimum-plausibility floor the showcase lead-capture route already
    // enforces — this manual staff-facing form previously had no length
    // check at all, which is how a malformed number could reach leads.phone.
    .refine((val) => isPlausiblePhoneNumber(val), {
      message: 'Enter a valid phone number',
    }),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  car_interest: z.string().max(200, 'Too long').optional(),
  car_id: z.string().uuid().optional(),
  // Accepts every source the DB allows (including 'website'), not just the
  // ones a staff member can pick manually — leadUpdateSchema must be able to
  // validate an existing website-sourced lead without rejecting it.
  source: z.enum(ALL_LEAD_SOURCES).default('whatsapp'),
  status: z.enum(['new', 'contacted', 'test_drive', 'negotiating', 'closed_won', 'closed_lost']).default('new'),
  assigned_to: z
    .string()
    .uuid()
    .optional()
    .or(z.literal(''))
    .transform((val) => (val === '' ? undefined : val)),
  notes: z.string().max(2000, 'Notes are too long').optional(),
})

// Output type (after defaults/transforms are applied) — what a successful submit yields.
export type LeadFormValues = z.infer<typeof leadSchema>
// Input type (before defaults/transforms) — what the form fields collect.
export type LeadFormInput = z.input<typeof leadSchema>

// Partial schema for updates — all fields optional
export const leadUpdateSchema = leadSchema.partial()
export type LeadUpdateValues = z.infer<typeof leadUpdateSchema>

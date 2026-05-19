import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase-server'

const resend = new Resend(process.env.RESEND_API_KEY)
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL // never exposed to client

export async function POST(req: Request) {
  try {
    const { name, email, subject, message, category } = await req.json()

    // Validate
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return NextResponse.json({ error: 'Name, email, and message are required' }, { status: 400 })
    }

    // Send email to support (server-side only — email never exposed)
    await resend.emails.send({
      from: 'College Units Fantasy <noreply@collegeunitsfantasy.com>',
      to: SUPPORT_EMAIL!,
      replyTo: email,  // reply goes directly to user
      subject: `[Support] ${category ? `[${category}] ` : ''}${subject || 'Contact Form Submission'}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #f5a623;">New Support Request — College Units Fantasy</h2>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:8px; font-weight:bold;">From:</td><td>${name} &lt;${email}&gt;</td></tr>
            <tr><td style="padding:8px; font-weight:bold;">Category:</td><td>${category || 'General'}</td></tr>
            <tr><td style="padding:8px; font-weight:bold;">Subject:</td><td>${subject || 'No subject'}</td></tr>
          </table>
          <div style="margin-top:16px; padding:16px; background:#f5f5f5; border-radius:8px;">
            <strong>Message:</strong>
            <p style="white-space:pre-wrap;">${message}</p>
          </div>
          <p style="color:#666; font-size:12px; margin-top:24px;">
            Reply to this email to respond directly to ${name} at ${email}
          </p>
        </div>
      `
    })

    // Send confirmation to user
    await resend.emails.send({
      from: 'College Units Fantasy Support <noreply@collegeunitsfantasy.com>',
      to: email,
      subject: 'We received your message — College Units Fantasy',
      html: `
        <div style="font-family: sans-serif; max-width: 600px;">
          <h2 style="color: #f5a623;">We got your message, ${name}!</h2>
          <p>Thanks for reaching out to College Units Fantasy support. We'll get back to you as soon as possible.</p>
          <div style="margin-top:16px; padding:16px; background:#f5f5f5; border-radius:8px;">
            <strong>Your message:</strong>
            <p style="white-space:pre-wrap;">${message}</p>
          </div>
          <p style="margin-top:24px;">— College Units Fantasy Team</p>
          <p style="color:#666; font-size:12px;">collegeunitsfantasy.com</p>
        </div>
      `
    })

    // Log to compliance_logs
    const admin = createAdminClient()
    await admin.from('compliance_logs').insert({
      event_type: 'support_contact',
      event_data: { name, email, category, subject: subject || '' },
      ip_address: req.headers.get('x-forwarded-for') ?? 'unknown',
    })

    return NextResponse.json({ success: true, message: 'Message sent! Check your email for confirmation.' })
  } catch (err: any) {
    console.error('[support/contact] error:', err?.message)
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}

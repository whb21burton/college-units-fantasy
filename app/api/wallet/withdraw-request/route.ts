import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { Resend } from 'resend'
import { cookies } from 'next/headers'

const resend = new Resend(process.env.RESEND_API_KEY)
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL!
const MIN_WITHDRAWAL = 100  // $1 minimum

export async function POST(req: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { amount_cents, method, handle } = await req.json()

    if (!amount_cents || amount_cents < MIN_WITHDRAWAL) {
      return NextResponse.json({ error: `Minimum withdrawal is $${(MIN_WITHDRAWAL/100).toFixed(2)}` }, { status: 400 })
    }
    if (!method || !handle?.trim()) {
      return NextResponse.json({ error: 'Payment method and handle required' }, { status: 400 })
    }

    const admin = createAdminClient()

    // Get wallet
    const { data: wallet } = await admin
      .from('wallets')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })

    // Get ledger accounts
    const { data: accounts } = await admin
      .from('ledger_accounts')
      .select('id, type')
      .eq('wallet_id', wallet.id)

    const availAcct = accounts?.find(a => a.type === 'user_available')

    if (!availAcct) return NextResponse.json({ error: 'Ledger account not found' }, { status: 404 })

    // Calculate available balance from ledger
    const { data: entries } = await admin
      .from('ledger_entries')
      .select('amount_cents')
      .eq('ledger_account_id', availAcct.id)

    const balance = entries?.reduce((s, e) => s + Number(e.amount_cents), 0) ?? 0

    if (balance < amount_cents) {
      return NextResponse.json({
        error: `Insufficient balance. Available: $${(balance/100).toFixed(2)}`,
        balance,
      }, { status: 400 })
    }

    // Generate reference
    const reference = `WD-${Date.now().toString(36).toUpperCase()}`

    // Create withdrawal transaction (pending)
    const { data: tx, error: txError } = await admin
      .from('transactions')
      .insert({
        user_id: user.id,
        type: 'withdrawal',
        status: 'pending',
        amount_cents,
        idempotency_key: `withdrawal_${user.id}_${Date.now()}`,
        description: `Withdrawal via ${method}: ${handle.trim()} | Ref: ${reference}`,
      })
      .select('id')
      .single()

    if (txError || !tx) {
      console.error('[withdraw-request] tx error:', txError?.message)
      return NextResponse.json({ error: 'Failed to create withdrawal' }, { status: 500 })
    }

    // Debit available balance (hold funds)
    await admin.from('ledger_entries').insert([
      { transaction_id: tx.id, ledger_account_id: availAcct.id, amount_cents: -amount_cents },
    ])

    // Email admin
    if (SUPPORT_EMAIL && process.env.RESEND_API_KEY) {
      await resend.emails.send({
        from: 'College Units Fantasy <noreply@collegeunitsfantasy.com>',
        to: SUPPORT_EMAIL,
        replyTo: user.email!,
        subject: `💰 Withdrawal Request — ${reference}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px">
            <h2 style="color:#f5a623">New Withdrawal Request</h2>
            <table style="width:100%;border-collapse:collapse">
              <tr><td style="padding:8px;font-weight:bold">Reference:</td><td>${reference}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">User:</td><td>${user.email}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">Amount:</td><td><strong>$${(amount_cents/100).toFixed(2)}</strong></td></tr>
              <tr><td style="padding:8px;font-weight:bold">Method:</td><td>${method}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">Handle:</td><td>${handle.trim()}</td></tr>
              <tr><td style="padding:8px;font-weight:bold">Transaction ID:</td><td>${tx.id}</td></tr>
            </table>
            <p style="margin-top:20px;color:#666">Send payment manually then mark as completed in Supabase transactions table.</p>
          </div>
        `
      }).catch(e => console.error('[withdraw-request] email error:', e.message))

      // Confirm to user
      await resend.emails.send({
        from: 'College Units Fantasy <noreply@collegeunitsfantasy.com>',
        to: user.email!,
        subject: `Withdrawal Request Received — ${reference}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px">
            <h2 style="color:#f5a623">Withdrawal Request Received</h2>
            <p>We received your withdrawal request for <strong>$${(amount_cents/100).toFixed(2)}</strong> via ${method} to ${handle.trim()}.</p>
            <p>Reference: <strong>${reference}</strong></p>
            <p>Withdrawals are processed within 1-3 business days. You'll receive a confirmation when payment is sent.</p>
            <p style="color:#666;font-size:12px">— College Units Fantasy Team</p>
          </div>
        `
      }).catch(e => console.error('[withdraw-request] confirm email error:', e.message))
    }

    return NextResponse.json({ success: true, reference, amount_cents })

  } catch (err: any) {
    console.error('[withdraw-request] unhandled:', err?.message)
    return NextResponse.json({ error: 'Server error. Please try again.' }, { status: 500 })
  }
}

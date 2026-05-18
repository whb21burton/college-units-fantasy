import { NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { createAdminClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

const ADMIN_ID = '603b48b1-3e85-4c72-bedb-c5166bbe9c6e'

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const admin = createAdminClient()

  // List all users and find bots
  const { data: listData, error: listErr } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 })

  const users = (listData as any).users as any[]
  const botUsers = users.filter((u: any) => (u.email as string | undefined)?.endsWith('@simulate.cuf.internal'))
  if (botUsers.length === 0) return NextResponse.json({ deleted: 0 })

  const botIds = botUsers.map((u: any) => u.id as string)
  let deleted = 0
  const errors: string[] = []

  for (const botId of botIds) {
    try {
      // Get wallet
      const { data: wallet } = await admin.from('wallets').select('id').eq('user_id', botId).single()

      if (wallet) {
        // Get ledger accounts
        const { data: accounts } = await admin.from('ledger_accounts').select('id').eq('wallet_id', wallet.id)
        const acctIds = (accounts ?? []).map(a => a.id)

        // Get transactions for this user
        const { data: txns } = await admin.from('transactions').select('id').eq('user_id', botId)
        const txnIds = (txns ?? []).map(t => t.id)

        // Delete ledger entries (by transaction or by account)
        if (txnIds.length > 0) {
          await admin.from('ledger_entries').delete().in('transaction_id', txnIds)
        }
        if (acctIds.length > 0) {
          await admin.from('ledger_entries').delete().in('ledger_account_id', acctIds)
        }

        // Delete transactions
        await admin.from('transactions').delete().eq('user_id', botId)

        // Delete ledger accounts
        await admin.from('ledger_accounts').delete().eq('wallet_id', wallet.id)

        // Delete wallet
        await admin.from('wallets').delete().eq('id', wallet.id)
      }

      // Delete league_members
      await admin.from('league_members').delete().eq('user_id', botId)

      // Delete auth user
      const { error: delErr } = await admin.auth.admin.deleteUser(botId)
      if (delErr) {
        errors.push(`Failed to delete auth user ${botId}: ${delErr.message}`)
      } else {
        deleted++
      }
    } catch (e: any) {
      errors.push(`Error cleaning up ${botId}: ${e.message}`)
    }
  }

  return NextResponse.json({ deleted, errors })
}

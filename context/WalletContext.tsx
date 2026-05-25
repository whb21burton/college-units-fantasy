'use client'
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface WalletContextType {
  balance: number
  pending: number
  loading: boolean
  refresh: () => Promise<void>
}

const WalletContext = createContext<WalletContextType>({
  balance: 0, pending: 0, loading: true,
  refresh: async () => {},
})

export function WalletProvider({ children }: { children: ReactNode }) {
  const [balance, setBalance] = useState(0)
  const [pending, setPending] = useState(0)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet')
      if (!res.ok) return
      const data = await res.json()
      setBalance(data.wallet?.available ?? 0)
      setPending(data.wallet?.pending ?? 0)
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh()

    const onVisible = () => { if (document.visibilityState === 'visible') refresh() }
    document.addEventListener('visibilitychange', onVisible)

    const interval = setInterval(refresh, 30000)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(interval)
    }
  }, [refresh])

  return (
    <WalletContext.Provider value={{ balance, pending, loading, refresh }}>
      {children}
    </WalletContext.Provider>
  )
}

export function useWallet() {
  return useContext(WalletContext)
}

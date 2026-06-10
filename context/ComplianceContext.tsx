'use client'
import { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { PAID_CONTESTS_ENABLED } from '@/lib/config'

interface ComplianceState {
  stateCode:  string | null
  stateName:  string | null
  restricted: boolean
  reason:     string | null
  loading:    boolean
}

const defaults: ComplianceState = {
  stateCode: null, stateName: null, restricted: false, reason: null, loading: true,
}

const ComplianceContext = createContext<ComplianceState>(defaults)

export function ComplianceProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ComplianceState>(defaults)

  useEffect(() => {
    if (!PAID_CONTESTS_ENABLED) { setState(s => ({ ...s, loading: false })); return; }
    fetch('/api/compliance/my-state')
      .then(r => r.json())
      .then(d => setState({ stateCode: d.stateCode, stateName: d.stateName, restricted: d.restricted ?? false, reason: d.reason, loading: false }))
      .catch(() => setState(s => ({ ...s, loading: false })))
  }, [])

  return (
    <ComplianceContext.Provider value={state}>
      {children}
    </ComplianceContext.Provider>
  )
}

export function useCompliance() {
  return useContext(ComplianceContext)
}

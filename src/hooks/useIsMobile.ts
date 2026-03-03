'use client'

import { useEffect, useState } from 'react'
import { createLogger } from '@/lib/logger'

const logger = createLogger('useIsMobile')

/**
 * Returns true when viewport width < 768px.
 * SSR-safe: returns false on server, updates after mount via MediaQueryList.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia('(max-width: 767px)')
    setIsMobile(mql.matches)
    logger.debug('useIsMobile initialized', { isMobile: mql.matches, width: window.innerWidth })

    const handler = (e: MediaQueryListEvent) => {
      logger.debug('viewport breakpoint changed', { isMobile: e.matches })
      setIsMobile(e.matches)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isMobile
}

'use client'

import { OnboardingChat } from '@/components/onboarding/OnboardingChat'

export default function OnboardingPage() {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        backgroundColor: '#0a0c10',
      }}
    >
      <OnboardingChat />
    </div>
  )
}

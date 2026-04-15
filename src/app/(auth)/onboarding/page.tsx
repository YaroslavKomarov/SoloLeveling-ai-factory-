'use client'

import { OnboardingChat } from '@/components/onboarding/OnboardingChat'

export default function OnboardingPage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        height: '100vh',
        minHeight: 0,
      }}
    >
      <OnboardingChat />
    </div>
  )
}

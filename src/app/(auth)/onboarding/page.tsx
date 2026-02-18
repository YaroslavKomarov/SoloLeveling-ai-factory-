'use client'

import { useOnboardingStore } from '@/store/onboarding'
import { WelcomeStep } from '@/components/onboarding/WelcomeStep'
import { ProfileSetupStep } from '@/components/onboarding/ProfileSetupStep'
import { CalendarStep } from '@/components/onboarding/CalendarStep'
import { RetroScheduleStep } from '@/components/onboarding/RetroScheduleStep'
import { CompleteStep } from '@/components/onboarding/CompleteStep'
import { saveProfileAction, saveRetroScheduleAction, completeOnboardingAction } from './actions'

const TOTAL_STEPS = 5

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2.5rem',
        justifyContent: 'center',
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i + 1 === current ? '24px' : '8px',
            height: '8px',
            backgroundColor:
              i + 1 < current
                ? 'rgba(255, 255, 255, 0.6)'
                : i + 1 === current
                ? '#ffffff'
                : 'rgba(255, 255, 255, 0.15)',
            borderRadius: '4px',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}

export default function OnboardingPage() {
  const { currentStep, advance, goBack, setData } = useOnboardingStore()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        maxWidth: '600px',
        padding: '2rem',
      }}
    >
      {currentStep > 1 && (
        <StepIndicator current={currentStep} total={TOTAL_STEPS} />
      )}

      {currentStep === 1 && <WelcomeStep onNext={advance} />}

      {currentStep === 2 && (
        <ProfileSetupStep
          onNext={async (data) => {
            setData({
              displayName: data.displayName,
              timezone: data.timezone,
              activityWindowStart: data.activityWindowStart,
              activityWindowEnd: data.activityWindowEnd,
            })
            await saveProfileAction(data)
            advance()
          }}
          onBack={goBack}
        />
      )}

      {currentStep === 3 && (
        <CalendarStep onNext={advance} onBack={goBack} />
      )}

      {currentStep === 4 && (
        <RetroScheduleStep
          onNext={async (data) => {
            setData({
              retrospectiveDay: data.retrospectiveDay,
              retrospectiveTime: data.retrospectiveTime,
            })
            await saveRetroScheduleAction(data.retrospectiveDay, data.retrospectiveTime)
            advance()
          }}
          onBack={goBack}
        />
      )}

      {currentStep === 5 && (
        <CompleteStep
          onComplete={async () => {
            await completeOnboardingAction()
          }}
        />
      )}
    </div>
  )
}

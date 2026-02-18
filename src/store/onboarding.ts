import { create } from 'zustand'

export interface OnboardingData {
  displayName: string
  timezone: string
  activityWindowStart: string
  activityWindowEnd: string
  calendarConnected: boolean
  retrospectiveDay: number
  retrospectiveTime: string
}

interface OnboardingState {
  currentStep: number
  data: Partial<OnboardingData>
  advance: () => void
  goBack: () => void
  setData: (partial: Partial<OnboardingData>) => void
  reset: () => void
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  currentStep: 1,
  data: {},

  advance: () => set((state) => ({ currentStep: state.currentStep + 1 })),
  goBack: () => set((state) => ({ currentStep: Math.max(1, state.currentStep - 1) })),
  setData: (partial) => set((state) => ({ data: { ...state.data, ...partial } })),
  reset: () => set({ currentStep: 1, data: {} }),
}))

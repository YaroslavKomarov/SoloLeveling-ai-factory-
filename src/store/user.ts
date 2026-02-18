import { create } from 'zustand'

export interface FatigueState {
  physical: number
  emotional: number
  intellectual: number
}

export interface UserState {
  level: number
  xp: number
  xpToNext: number
  fatigue: FatigueState
  displayName: string | null
  avatarUrl: string | null
  isLoaded: boolean

  setUser: (data: Partial<Omit<UserState, 'setUser' | 'setFatigue' | 'addXp'>>) => void
  setFatigue: (fatigue: Partial<FatigueState>) => void
  addXp: (amount: number) => void
}

function calcXpToNext(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
}

export const useUserStore = create<UserState>((set) => ({
  level: 1,
  xp: 0,
  xpToNext: calcXpToNext(1),
  fatigue: { physical: 0, emotional: 0, intellectual: 0 },
  displayName: null,
  avatarUrl: null,
  isLoaded: false,

  setUser: (data) => set((state) => ({ ...state, ...data })),

  setFatigue: (fatigue) =>
    set((state) => ({
      fatigue: { ...state.fatigue, ...fatigue },
    })),

  addXp: (amount) =>
    set((state) => {
      const newXp = state.xp + amount
      if (newXp >= state.xpToNext) {
        const newLevel = state.level + 1
        return {
          xp: newXp - state.xpToNext,
          level: newLevel,
          xpToNext: calcXpToNext(newLevel),
        }
      }
      return { xp: newXp }
    }),
}))

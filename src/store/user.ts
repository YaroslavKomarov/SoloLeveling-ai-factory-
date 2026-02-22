import { create } from 'zustand'
import { createLogger } from '@/lib/logger'

const logger = createLogger('UserStore')

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

  setUser: (data: Partial<Omit<UserState, 'setUser' | 'setFatigue' | 'addXp' | 'incrementFatigue' | 'setXp'>>) => void
  setFatigue: (fatigue: Partial<FatigueState>) => void
  addXp: (amount: number) => void
  /** Optimistic fatigue increment: adds delta to the specified fatigue type only (capped at 100) */
  incrementFatigue: (delta: number, type: 'physical' | 'emotional' | 'intellectual') => void
  /** Sync XP and level from server response after task completion */
  setXp: (xp: number, level: number) => void
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

  incrementFatigue: (delta, type) =>
    set((state) => {
      const newFatigue = {
        physical:     Math.min(100, state.fatigue.physical     + (type === 'physical'     ? delta : 0)),
        emotional:    Math.min(100, state.fatigue.emotional    + (type === 'emotional'    ? delta : 0)),
        intellectual: Math.min(100, state.fatigue.intellectual + (type === 'intellectual' ? delta : 0)),
      }
      logger.debug('Fatigue updated', { delta, type, newFatigue })
      return { fatigue: newFatigue }
    }),

  setXp: (xp, level) =>
    set(() => {
      logger.debug('XP animation', { xp, level })
      return {
        xp,
        level,
        xpToNext: calcXpToNext(level),
      }
    }),
}))

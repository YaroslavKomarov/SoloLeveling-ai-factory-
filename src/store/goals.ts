/**
 * Global goal state store.
 * Holds spheres, goals, and quests loaded from the server.
 */
import { create } from 'zustand'
import type { GoalRow, QuestRow, SphereRow } from '@/lib/supabase/types'

interface GoalsState {
  spheres: SphereRow[]
  goals: GoalRow[]
  quests: Record<string, QuestRow[]>  // keyed by goalId
  isLoaded: boolean

  setSpheres: (spheres: SphereRow[]) => void
  addSphere: (sphere: SphereRow) => void
  setGoals: (goals: GoalRow[]) => void
  addGoal: (goal: GoalRow) => void
  updateGoal: (goalId: string, updates: Partial<GoalRow>) => void
  setQuests: (goalId: string, quests: QuestRow[]) => void
  updateQuestProgress: (questId: string, currentValue: number) => void
}

export const useGoalsStore = create<GoalsState>((set) => ({
  spheres: [],
  goals: [],
  quests: {},
  isLoaded: false,

  setSpheres: (spheres) => set({ spheres }),

  addSphere: (sphere) =>
    set((state) => ({ spheres: [...state.spheres, sphere] })),

  setGoals: (goals) => set({ goals, isLoaded: true }),

  addGoal: (goal) =>
    set((state) => ({ goals: [...state.goals, goal] })),

  updateGoal: (goalId, updates) =>
    set((state) => ({
      goals: state.goals.map((g) => g.id === goalId ? { ...g, ...updates } : g),
    })),

  setQuests: (goalId, quests) =>
    set((state) => ({
      quests: { ...state.quests, [goalId]: quests },
    })),

  updateQuestProgress: (questId, currentValue) =>
    set((state) => {
      const updatedQuests: Record<string, QuestRow[]> = {}
      for (const [goalId, questList] of Object.entries(state.quests)) {
        updatedQuests[goalId] = questList.map((q) =>
          q.id === questId ? { ...q, current_value: currentValue } : q
        )
      }
      return { quests: updatedQuests }
    }),
}))

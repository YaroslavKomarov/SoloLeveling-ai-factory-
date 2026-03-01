/**
 * Tests for the goal-expert agent prompt builder.
 */
import { describe, it, expect } from 'vitest'
import { buildGoalExpertSystemPrompt, GOAL_EXPERT_GENERAL_PROMPT, GOAL_EXPERT_TASK_MODE_PROMPT } from '../prompt'

const baseParams = {
  goalTitle: 'Learn TypeScript',
  goalDescription: 'Master TypeScript in 90 days',
  goalType: 'skill' as const,
  sphereName: 'Work',
  daysRemaining: 60,
  quests: [
    { title: 'Complete 3 projects', current_value: 1, target_value: 3, unit: 'projects' },
  ],
  userId: 'user-123',
  goalId: 'goal-456',
}

describe('buildGoalExpertSystemPrompt', () => {
  it('contains native command instructions in general mode', () => {
    const prompt = buildGoalExpertSystemPrompt(baseParams)
    expect(prompt).toContain('createNote')
    expect(prompt).toContain('searchGoalNotes')
    expect(prompt).toContain('updateTask')
    expect(prompt).toContain('создай заметку')
  })

  it('injects goal context in general mode', () => {
    const prompt = buildGoalExpertSystemPrompt(baseParams)
    expect(prompt).toContain('Learn TypeScript')
    expect(prompt).toContain('Work')
    expect(prompt).toContain('60')
    expect(prompt).toContain('Complete 3 projects')
    expect(prompt).toContain('user-123')
    expect(prompt).toContain('goal-456')
  })

  it('uses general prompt base when no taskContext', () => {
    const prompt = buildGoalExpertSystemPrompt(baseParams)
    expect(prompt).toContain(GOAL_EXPERT_GENERAL_PROMPT.slice(0, 50))
    expect(prompt).not.toContain(GOAL_EXPERT_TASK_MODE_PROMPT.slice(0, 50))
  })

  it('uses task mode prompt when taskContext provided', () => {
    const prompt = buildGoalExpertSystemPrompt({
      ...baseParams,
      taskContext: {
        taskId: 'task-789',
        taskTitle: 'Build a REST API',
        remainingMinutes: 20,
      },
    })
    expect(prompt).toContain(GOAL_EXPERT_TASK_MODE_PROMPT.slice(0, 50))
    expect(prompt).toContain('Build a REST API')
    expect(prompt).toContain('20')
    expect(prompt).toContain('task-789')
  })

  it('task mode contains Socratic guidance instruction', () => {
    const prompt = buildGoalExpertSystemPrompt({
      ...baseParams,
      taskContext: { taskId: 't1', taskTitle: 'Some task', remainingMinutes: 15 },
    })
    expect(prompt).toContain("Guide, don't solve")
    // Task mode should also have createNote instruction
    expect(prompt).toContain('createNote')
  })

  it('includes quest progress in both modes', () => {
    const general = buildGoalExpertSystemPrompt(baseParams)
    const task = buildGoalExpertSystemPrompt({
      ...baseParams,
      taskContext: { taskId: 't1', taskTitle: 'task', remainingMinutes: 10 },
    })
    expect(general).toContain('1/3')
    expect(task).toContain('1/3')
  })
})

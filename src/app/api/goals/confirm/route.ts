/**
 * POST /api/goals/confirm
 * Creates a goal + quests + tasks in a single transaction-like sequence.
 * Called from GoalCreationDialog after plan preview is approved.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGoal, createQuests, clearDialogMessages } from '@/lib/supabase/goals'
import { createTasks } from '@/lib/supabase/tasks'
import { createLogger } from '@/lib/logger'
import type { GoalInsert, GoalType, QuestDraft, QuestInsert, TaskInsert, TaskPlanEntry } from '@/lib/supabase/types'

const logger = createLogger('api/goals/confirm')

interface ConfirmBody {
  sphereId: string
  goalType: GoalType
  title: string
  description?: string
  quests: QuestDraft[]
  tasks: TaskPlanEntry[]
  startDate: string
  endDate: string
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ConfirmBody
    const { sphereId, goalType, title, description, quests, tasks, startDate, endDate } = body

    logger.debug('confirm goal request', {
      sphereId,
      goalType,
      questCount: quests.length,
      taskCount: tasks.length,
      startDate,
      endDate,
    })

    if (!sphereId || !goalType || !quests?.length || !tasks?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // 1. Create goal
    const goalInsert: GoalInsert = {
      user_id: user.id,
      sphere_id: sphereId,
      title: title ?? quests[0]?.title ?? 'Untitled Goal',
      description: description ?? null,
      goal_type: goalType,
      start_date: startDate,
      end_date: endDate,
    }

    const goal = await createGoal(supabase, goalInsert)
    logger.debug('goal created', { goalId: goal.id })

    // 2. Create quests
    const questInserts: QuestInsert[] = quests.map((q, i) => ({
      goal_id: goal.id,
      user_id: user.id,
      title: q.title,
      target_value: q.targetValue,
      unit: q.unit,
      order_index: i,
      current_value: 0,
    }))

    const createdQuests = await createQuests(supabase, questInserts)
    logger.debug('quests created', { count: createdQuests.length })

    // Map questIndex → questId
    const questIdByIndex = new Map(createdQuests.map((q, i) => [i, q.id]))

    // 3. Create tasks
    const taskInserts: TaskInsert[] = tasks.map((t) => ({
      user_id: user.id,
      goal_id: goal.id,
      quest_id: questIdByIndex.get(t.questIndex) ?? null,
      title: t.title,
      task_type: t.taskType,
      scheduled_date: t.scheduledDate,
      xp_reward: t.xpReward,
      fatigue_cost: t.fatigueCost,
      repetition_index: t.repetitionIndex ?? null,
      sequence_index: t.sequenceIndex ?? null,
    }))

    await createTasks(supabase, taskInserts)
    logger.debug('tasks created', { count: taskInserts.length })

    // 4. Clear dialog messages for this sphere
    await clearDialogMessages(supabase, user.id, sphereId)

    logger.info('goal confirmed', { goalId: goal.id, userId: user.id, taskCount: taskInserts.length })

    return NextResponse.json({ goal })

  } catch (error) {
    logger.error('confirm goal failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

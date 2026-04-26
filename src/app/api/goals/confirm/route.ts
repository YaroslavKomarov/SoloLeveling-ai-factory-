/**
 * POST /api/goals/confirm
 * Creates a goal + quests + tasks in a single transaction-like sequence.
 * v2: queue-based tasks (order_index, no calendar), materials → KB notes, deadline_date.
 */
import { after } from 'next/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGoal, createQuests, clearDialogMessages, getActiveGoalBySphere } from '@/lib/supabase/goals'
import { createTasks } from '@/lib/supabase/tasks'
import { createNote } from '@/lib/supabase/notes'
import { getSphereById } from '@/lib/supabase/spheres'
import { dispatchGoalTasksToSchedulerbot } from '@/lib/services/goal-dispatch'
import { createLogger } from '@/lib/logger'
import type { GoalInsert, GoalType, QuestDraft, QuestInsert, TaskInsert, QueueTaskEntry } from '@/lib/supabase/types'

const logger = createLogger('api/goals/confirm')

interface ConfirmBody {
  sphereId: string
  goalType: GoalType
  title?: string
  description?: string
  quests: QuestDraft[]
  tasks: QueueTaskEntry[]
  deadlineDate?: string
  materials?: Array<{ title: string; content: string; url?: string }>
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as ConfirmBody
    const { sphereId, goalType, title, description, quests, tasks, deadlineDate, materials } = body

    logger.info('confirm goal', {
      sphereId,
      questCount: quests?.length ?? 0,
      taskCount: tasks?.length ?? 0,
      hasDeadline: !!deadlineDate,
      materialCount: materials?.length ?? 0,
    })

    if (!sphereId || !goalType || !quests?.length || !tasks?.length) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Enforce one active goal per sphere constraint
    const existingActiveGoal = await getActiveGoalBySphere(supabase, user.id, sphereId)
    if (existingActiveGoal) {
      logger.warn('confirm goal: blocked — active goal exists', {
        sphereId,
        existingGoalId: existingActiveGoal.id,
      })
      return NextResponse.json(
        { error: 'ACTIVE_GOAL_EXISTS', message: 'This sphere already has an active goal' },
        { status: 409 }
      )
    }

    const today = new Date().toISOString().slice(0, 10)
    const startPlusNinety = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

    // 1. Create goal
    const goalInsert: GoalInsert = {
      user_id: user.id,
      sphere_id: sphereId,
      title: title ?? quests[0]?.title ?? 'Untitled Goal',
      description: description ?? null,
      goal_type: goalType,
      start_date: today,
      end_date: startPlusNinety,  // constraint requires end_date = start_date + 90 days
      deadline_date: deadlineDate ?? null,
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

    // 3. Create tasks with order_index (queue-based, no scheduled_date)
    const taskInserts: TaskInsert[] = tasks.map((t) => {
      const fatigueType = t.fatigueType ?? 'intellectual'
      return {
        user_id: user.id,
        goal_id: goal.id,
        quest_id: questIdByIndex.get(t.questIndex) ?? null,
        title: t.title,
        task_type: t.taskType,
        scheduled_date: null,
        order_index: t.orderIndex,
        xp_reward: t.xpReward,
        fatigue_cost: t.fatigueCost,
        fatigue_type: fatigueType,
        repetition_index: t.repetitionIndex ?? null,
        sequence_index: t.sequenceIndex ?? null,
        description: t.description ?? null,
        duration_minutes: t.durationMinutes,
      }
    })

    const createdTasks = await createTasks(supabase, taskInserts)
    logger.info('goal confirmed', {
      goalId: goal.id,
      questCount: createdQuests.length,
      taskCount: createdTasks.length,
    })

    // 4. Clear dialog messages for this sphere
    await clearDialogMessages(supabase, user.id, sphereId)

    // 5. Auto-create goal.md note and material notes after response is sent
    after(async () => {
      try {
        const sphere = await getSphereById(supabase, sphereId)
        const sphereSlug = (sphere?.name ?? 'unknown').toLowerCase().replace(/\s+/g, '-')
        const goalSlug = goal.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)
        const questChecklist = createdQuests
          .map((q) => `- [ ] ${q.title} (target: ${q.target_value} ${q.unit})`)
          .join('\n')

        await createNote(supabase, {
          user_id: user.id,
          path: `${sphereSlug}/${goalSlug}/goal.md`,
          title: goal.title,
          content: `---\ntype: goal\ngoal_id: ${goal.id}\nsphere_id: ${sphereId}\nstart_date: ${today}\ndeadline_date: ${deadlineDate ?? 'none'}\n---\n# ${goal.title}\n\n## Key Results\n${questChecklist}\n`,
        })
        logger.info('Goal note auto-created', { goalId: goal.id, sphereSlug, goalSlug })

        // Save materials as KB notes
        for (let i = 0; i < (materials?.length ?? 0); i++) {
          const material = materials![i]
          const materialSlug = material.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30)
          const path = `${sphereSlug}/${goalSlug}/materials/${i + 1}-${materialSlug}.md`
          const content = `---\ntitle: "${material.title}"\nurl: ${material.url ?? 'none'}\ndate: ${today}\n---\n\n${material.content}`
          logger.debug('saving material note', { path, contentLength: content.length })
          await createNote(supabase, {
            user_id: user.id,
            path,
            title: material.title,
            content,
          })
        }
        logger.debug('dispatching tasks to schedulerbot', { goalId: goal.id, taskCount: createdTasks.length })
        await dispatchGoalTasksToSchedulerbot({
          supabase,
          userId: user.id,
          sphereId,
          goalId: goal.id,
          tasks: createdTasks,
          deadlineDate: deadlineDate ?? null,
        })
      } catch (err) {
        logger.warn('Goal note / materials auto-creation failed (non-blocking)', {
          goalId: goal.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    return NextResponse.json({ goal })

  } catch (error) {
    logger.error('confirm goal failed', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

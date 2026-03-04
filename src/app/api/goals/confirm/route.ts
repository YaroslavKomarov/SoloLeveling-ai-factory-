/**
 * POST /api/goals/confirm
 * Creates a goal + quests + tasks in a single transaction-like sequence.
 * Called from GoalCreationDialog after plan preview is approved.
 */
import { after } from 'next/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createGoal, createQuests, clearDialogMessages, getActiveGoalBySphere } from '@/lib/supabase/goals'
import { createTasks } from '@/lib/supabase/tasks'
import { createNote } from '@/lib/supabase/notes'
import { getSphereById } from '@/lib/supabase/spheres'
import { decryptToken, encryptToken } from '@/lib/calendar/encryption'
import { refreshAccessToken, type OAuthTokens } from '@/lib/calendar/oauth'
import { createTaskEvent } from '@/lib/calendar/event-sync'
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

    // 1a. Enforce one active goal per sphere constraint
    const existingActiveGoal = await getActiveGoalBySphere(supabase, user.id, sphereId)
    logger.info('[goals/confirm] active goal check', {
      sphereId,
      existingGoalId: existingActiveGoal?.id ?? null,
    })
    if (existingActiveGoal) {
      logger.warn('[goals/confirm] blocked: active goal exists', {
        sphereId,
        existingGoalId: existingActiveGoal.id,
      })
      return NextResponse.json(
        { error: 'ACTIVE_GOAL_EXISTS', message: 'This sphere already has an active goal' },
        { status: 409 }
      )
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
    const taskInserts: TaskInsert[] = tasks.map((t) => {
      const fatigueType = t.fatigueType ?? 'intellectual'
      if (!t.fatigueType) {
        logger.warn('fatigue_type missing on task — defaulting to intellectual', {
          taskTitle: t.title,
          taskType: t.taskType,
          questIndex: t.questIndex,
        })
      }
      logger.debug('fatigue_type assigned', {
        taskTitle: t.title,
        fatigueType,
        taskType: t.taskType,
      })
      return {
        user_id: user.id,
        goal_id: goal.id,
        quest_id: questIdByIndex.get(t.questIndex) ?? null,
        title: t.title,
        task_type: t.taskType,
        scheduled_date: t.scheduledDate,
        xp_reward: t.xpReward,
        fatigue_cost: t.fatigueCost,
        fatigue_type: fatigueType,
        repetition_index: t.repetitionIndex ?? null,
        sequence_index: t.sequenceIndex ?? null,
        description: t.description ?? null,
        duration_minutes: t.taskType === 'strategic' ? 27 : 12,
      }
    })

    const createdTasks = await createTasks(supabase, taskInserts)
    logger.debug('tasks created', { count: createdTasks.length })

    // 4. Clear dialog messages for this sphere
    await clearDialogMessages(supabase, user.id, sphereId)

    logger.info('goal confirmed', { goalId: goal.id, userId: user.id, taskCount: taskInserts.length })

    // 5. Auto-create goal.md note after response is sent
    after(async () => {
      try {
        const sphere = await getSphereById(supabase, sphereId)
        const sphereName = sphere?.name ?? 'unknown'
        const questChecklist = createdQuests
          .map((q) => `- [ ] ${q.title} (target: ${q.target_value} ${q.unit})`)
          .join('\n')

        await createNote(supabase, {
          user_id: user.id,
          path: `${sphereName}/${goal.title}/goal.md`,
          title: goal.title,
          content: `---\ntype: goal\ngoal_id: ${goal.id}\nsphere_id: ${sphereId}\nstart_date: ${startDate}\nend_date: ${endDate}\n---\n# ${goal.title}\n\n## Key Results\n${questChecklist}\n`,
        })
        logger.info('Goal note auto-created', { goalId: goal.id, sphereName, goalTitle: goal.title })
      } catch (err) {
        logger.warn('Goal note auto-creation failed (non-blocking)', {
          goalId: goal.id,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    })

    // 6. Sync created tasks to Google Calendar after response is sent (after() ensures Vercel doesn't kill the work early)
    after(async () => {
      try {
        const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY
        if (!encryptionKey) {
          logger.warn('[FIX] calendar sync skipped: TOKEN_ENCRYPTION_KEY not set', { goalId: goal.id })
          return
        }

        const adminSupabase = createAdminClient()
        const { data: profile } = await adminSupabase
          .from('users')
          .select('calendar_token_encrypted, timezone, activity_window_start')
          .eq('id', user.id)
          .maybeSingle()

        if (!profile?.calendar_token_encrypted) {
          logger.debug('[FIX] calendar sync skipped: no calendar connected', { userId: user.id, goalId: goal.id })
          return
        }

        let tokens = JSON.parse(decryptToken(profile.calendar_token_encrypted, encryptionKey)) as OAuthTokens

        // Refresh token if expired or within 5 min of expiry
        const expiresAt = new Date(tokens.expiresAt).getTime()
        if (Date.now() > expiresAt - 5 * 60 * 1000) {
          if (!tokens.refresh_token) {
            logger.warn('[FIX] calendar sync skipped: token expired, no refresh token', { userId: user.id })
            return
          }
          logger.info('[FIX] calendar sync: refreshing access token', { userId: user.id })
          tokens = await refreshAccessToken(tokens.refresh_token)
          const newEncrypted = encryptToken(JSON.stringify(tokens), encryptionKey)
          await adminSupabase.from('users').update({ calendar_token_encrypted: newEncrypted }).eq('id', user.id)
        }

        const timezone = profile.timezone || 'UTC'
        const activityStart = (profile.activity_window_start as string | null) || '09:00:00'
        const [startHourStr, startMinuteStr] = activityStart.split(':')
        const startHour = Number(startHourStr ?? '9')
        const startMinute = Number(startMinuteStr ?? '0')

        // Group tasks by date to assign sequential start times per day
        const tasksByDate = new Map<string, typeof createdTasks>()
        for (const task of createdTasks) {
          const date = task.scheduled_date
          if (!tasksByDate.has(date)) tasksByDate.set(date, [])
          tasksByDate.get(date)!.push(task)
        }

        let totalSynced = 0

        for (const [, dateTasks] of tasksByDate) {
          let currentOffsetMin = 0
          for (const task of dateTasks) {
            const durationMin = task.duration_minutes ?? (task.task_type === 'strategic' ? 27 : 12)
            const totalMin = startHour * 60 + startMinute + currentOffsetMin
            const eventHour = Math.floor(totalMin / 60) % 24
            const eventMinute = totalMin % 60
            const eventStartStr = `${String(eventHour).padStart(2, '0')}:${String(eventMinute).padStart(2, '0')}:00`

            try {
              const eventId = await createTaskEvent(
                tokens.access_token,
                { ...task, duration_minutes: durationMin, description: task.description ?? null },
                eventStartStr,
                timezone,
                goal.title
              )
              await adminSupabase.from('tasks').update({ calendar_event_id: eventId }).eq('id', task.id)
              const gapMin = task.task_type === 'strategic' ? 15 : 10
              currentOffsetMin += durationMin + gapMin
              totalSynced++
            } catch (err) {
              logger.error('[FIX] calendar sync: event creation failed for task', {
                taskId: task.id,
                scheduledDate: task.scheduled_date,
                error: err instanceof Error ? err.message : String(err),
              })
              const gapMin = task.task_type === 'strategic' ? 15 : 10
              currentOffsetMin += durationMin + gapMin
            }
          }
        }

        logger.info('[FIX] calendar sync: complete', {
          goalId: goal.id,
          userId: user.id,
          totalTasks: createdTasks.length,
          synced: totalSynced,
        })
      } catch (err) {
        logger.warn('[FIX] calendar sync failed (non-blocking)', {
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

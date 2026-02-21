/**
 * XP service — level calculation and level-up detection.
 * Formula: xpToNextLevel(level) = Math.floor(100 * level^1.5)
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { createLogger } from '@/lib/logger'

const logger = createLogger('XpService')

type DB = SupabaseClient<Database>

export interface AddXpResult {
  newXp: number
  newLevel: number
  didLevelUp: boolean
  previousLevel: number
}

/**
 * Returns the XP required to reach the next level from the given level.
 * Formula: floor(100 * level^1.5)
 */
export function xpToNextLevel(level: number): number {
  return Math.floor(100 * Math.pow(level, 1.5))
}

/**
 * Adds XP to the user, handles single and multi-level-up cases.
 * Reads current state from DB, updates, and returns the result.
 */
export async function addXpToUser(
  supabase: DB,
  userId: string,
  xpAmount: number
): Promise<AddXpResult> {
  logger.debug(`Adding ${xpAmount} XP to user ${userId}`)

  // Fetch current user xp + level
  const { data: user, error: fetchError } = await supabase
    .from('users')
    .select('level, xp')
    .eq('id', userId)
    .single()

  if (fetchError || !user) {
    logger.error('Failed to fetch user for XP update', { userId, error: fetchError?.message })
    throw new Error(`addXpToUser: could not fetch user ${userId}: ${fetchError?.message}`)
  }

  const previousLevel = user.level
  let currentXp = user.xp + xpAmount
  let currentLevel = user.level

  logger.debug('XP before', { userId, xpBefore: user.xp, xpGained: xpAmount, levelBefore: previousLevel })

  // Loop to handle multi-level-ups
  let didLevelUp = false
  while (currentXp >= xpToNextLevel(currentLevel)) {
    currentXp -= xpToNextLevel(currentLevel)
    currentLevel += 1
    didLevelUp = true
    logger.info(`LEVEL UP! User ${userId} reached level ${currentLevel}`, {
      userId,
      newLevel: currentLevel,
    })
  }

  logger.debug('XP after', {
    userId,
    xpBefore: user.xp,
    xpAfter: currentXp,
    levelBefore: previousLevel,
    levelAfter: currentLevel,
  })

  // Persist updated XP and level
  const { error: updateError } = await supabase
    .from('users')
    .update({ xp: currentXp, level: currentLevel })
    .eq('id', userId)

  if (updateError) {
    logger.error('Failed to update user XP/level', { userId, error: updateError.message })
    throw new Error(`addXpToUser: DB update failed: ${updateError.message}`)
  }

  logger.debug('User XP/level updated in DB', { userId, newXp: currentXp, newLevel: currentLevel })

  return {
    newXp: currentXp,
    newLevel: currentLevel,
    didLevelUp,
    previousLevel,
  }
}

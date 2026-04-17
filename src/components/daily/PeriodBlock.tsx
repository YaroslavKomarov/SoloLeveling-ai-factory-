'use client'

/**
 * PeriodBlock — expandable activity-period card for the daily timeline.
 * Collapsed: shows period name, time range, sphere, goal tag.
 * Expanded: goal name + deadline, fatigue bars (read-only), task list (read-only).
 * No task-execution buttons — those are Milestones D/E.
 */
import { useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, ChevronUp, Clock, Zap, Target, AlertCircle } from 'lucide-react'
import { useUserStore } from '@/store/user'
import { createLogger } from '@/lib/logger'
import type { PeriodWithTasks } from '@/store/periods'

const logger = createLogger('PeriodBlock')

interface Props {
  data: PeriodWithTasks
  isExpanded: boolean
  onToggle: () => void
  /** Whether the current real-time clock falls inside this period */
  isActive: boolean
}

function formatTime(timeStr: string): string {
  const [h, m] = timeStr.split(':')
  return `${h}:${m}`
}

function FatigueBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-white/50 w-20 uppercase tracking-wider font-['Cinzel']">{label}</span>
      <div className="flex-1 h-1 bg-white/10">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${value}%`, backgroundColor: color }}
        />
      </div>
      <span className="text-xs w-8 text-right font-['Orbitron']" style={{ color }}>
        {value}%
      </span>
    </div>
  )
}

export function PeriodBlock({ data, isExpanded, onToggle, isActive }: Props) {
  const { period, sphere, goal, tasks, periodMinutes, loadedMinutes } = data
  const fatigue = useUserStore((s) => s.fatigue)

  useEffect(() => {
    logger.debug('[PeriodBlock] mounted', { periodId: period.id, taskCount: tasks.length })
  }, [period.id, tasks.length])

  const handleToggle = () => {
    logger.debug('[PeriodBlock] toggled', { periodId: period.id, expanded: !isExpanded })
    onToggle()
  }

  return (
    <div
      className={`border border-white/10 bg-[#0a0c10] transition-colors ${
        isActive ? 'border-white/30' : ''
      }`}
    >
      {/* Collapsed header — always visible */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-white/5 transition-colors"
      >
        {/* Active indicator dot */}
        {isActive && (
          <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-['Cinzel'] text-white truncate">{period.name}</span>
            <span className="text-xs text-white/40 font-['Cormorant'] flex-shrink-0">
              {formatTime(period.start_time)}–{formatTime(period.end_time)}
            </span>
          </div>

          <div className="flex items-center gap-2 mt-0.5">
            {sphere ? (
              <span className="text-xs text-white/50">{sphere.name}</span>
            ) : null}
            {goal ? (
              <span className="text-xs text-white/30 font-['Cormorant'] truncate">
                {goal.title}
              </span>
            ) : (
              <span className="text-xs text-white/20 font-['Cormorant']">No active goal</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-white/30 font-['Orbitron']">
            {tasks.length}t
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-white/40" />
          ) : (
            <ChevronDown className="w-4 h-4 text-white/40" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30, duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-4 space-y-4 border-t border-white/5">
              {/* Goal info */}
              {goal ? (
                <div className="pt-3">
                  <div className="flex items-center gap-2">
                    <Target className="w-3 h-3 text-white/40" />
                    <span className="text-sm font-['Cinzel'] text-white">{goal.title}</span>
                  </div>
                  {goal.deadline_date && (
                    <div className="flex items-center gap-2 mt-1">
                      <Clock className="w-3 h-3 text-white/30" />
                      <span className="text-xs text-white/30 font-['Cormorant']">
                        Deadline: {goal.deadline_date}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-3 flex items-center gap-2 text-white/30">
                  <AlertCircle className="w-3 h-3" />
                  <span className="text-xs font-['Cormorant']">No active goal for this period</span>
                </div>
              )}

              {/* Fatigue bars (read-only) */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1 mb-1">
                  <Zap className="w-3 h-3 text-white/30" />
                  <span className="text-xs text-white/30 uppercase tracking-wider font-['Cinzel']">Fatigue</span>
                </div>
                <FatigueBar label="Physical" value={fatigue.physical} color="#00d4ff" />
                <FatigueBar label="Emotional" value={fatigue.emotional} color="#ec4899" />
                <FatigueBar label="Intellectual" value={fatigue.intellectual} color="#a855f7" />
              </div>

              {/* Task list (read-only) */}
              <div className="space-y-1.5">
                {tasks.length === 0 ? (
                  <p className="text-xs text-white/20 font-['Cormorant'] italic">
                    Queue is empty for this period
                  </p>
                ) : (
                  tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-0"
                    >
                      <span
                        className="text-xs px-1.5 py-0.5 border font-['Cinzel'] uppercase tracking-wider flex-shrink-0"
                        style={{
                          borderColor: task.task_type === 'strategic' ? '#a855f7' : '#00d4ff',
                          color: task.task_type === 'strategic' ? '#a855f7' : '#00d4ff',
                        }}
                      >
                        {task.task_type === 'strategic' ? 'STR' : 'REG'}
                      </span>
                      <span className="text-sm text-white/80 font-['Cormorant'] flex-1 truncate">
                        {task.title}
                      </span>
                      <span className="text-xs text-white/30 font-['Orbitron'] flex-shrink-0">
                        {task.duration_minutes}m
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Footer */}
              <div className="text-xs text-white/20 font-['Orbitron'] text-right">
                {loadedMinutes}min loaded / {periodMinutes}min period
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

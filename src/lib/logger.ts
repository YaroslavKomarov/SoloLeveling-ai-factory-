/**
 * Configurable logger utility.
 * Control verbosity via LOG_LEVEL env var: 'debug' | 'info' | 'warn' | 'error'
 * Defaults to 'info' in production, 'debug' in development.
 */

const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info')

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const
type LogLevel = keyof typeof LEVELS

function shouldLog(level: LogLevel): boolean {
  const configured = LEVELS[LOG_LEVEL as LogLevel] ?? LEVELS.info
  return LEVELS[level] >= configured
}

export interface Logger {
  debug: (msg: string, data?: unknown) => void
  info: (msg: string, data?: unknown) => void
  warn: (msg: string, data?: unknown) => void
  error: (msg: string, data?: unknown) => void
}

export function createLogger(module: string): Logger {
  return {
    debug: (msg: string, data?: unknown) => {
      if (shouldLog('debug')) {
        console.debug(`[${module}] ${msg}`, data !== undefined ? data : '')
      }
    },
    info: (msg: string, data?: unknown) => {
      if (shouldLog('info')) {
        console.info(`[${module}] ${msg}`, data !== undefined ? data : '')
      }
    },
    warn: (msg: string, data?: unknown) => {
      if (shouldLog('warn')) {
        console.warn(`[${module}] ${msg}`, data !== undefined ? data : '')
      }
    },
    error: (msg: string, data?: unknown) => {
      // errors always logged regardless of LOG_LEVEL
      console.error(`[${module}] ${msg}`, data !== undefined ? data : '')
    },
  }
}

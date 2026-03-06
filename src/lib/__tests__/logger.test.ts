import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// LOG_LEVEL is captured as a module-level const at import time.
// Each test group that needs a different level must:
//   1. vi.stubEnv('LOG_LEVEL', value)
//   2. vi.resetModules()
//   3. dynamically import createLogger
// so the module is re-evaluated with the correct env var.

async function getLogger(module: string) {
  const { createLogger } = await import('../logger')
  return createLogger(module)
}

describe('createLogger', () => {
  let debugSpy: ReturnType<typeof vi.spyOn>
  let infoSpy: ReturnType<typeof vi.spyOn>
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  // ─── module prefix & data argument ────────────────────────────────────────

  it('prefixes message with [ModuleName]', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('MyModule')

    logger.info('hello')

    expect(infoSpy).toHaveBeenCalledWith('[MyModule] hello', '')
  })

  it('passes data object as second argument', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('Test')
    const data = { userId: 'abc', count: 5 }

    logger.info('with data', data)

    expect(infoSpy).toHaveBeenCalledWith('[Test] with data', data)
  })

  it('passes empty string when no data provided', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('Test')

    logger.warn('no data')

    expect(warnSpy).toHaveBeenCalledWith('[Test] no data', '')
  })

  it('passes data when data is null', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('Test')

    logger.debug('null data', null)

    expect(debugSpy).toHaveBeenCalledWith('[Test] null data', null)
  })

  // ─── LOG_LEVEL=debug ───────────────────────────────────────────────────────

  describe('LOG_LEVEL=debug', () => {
    beforeEach(() => {
      vi.stubEnv('LOG_LEVEL', 'debug')
      vi.resetModules()
    })

    it('logs debug', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).toHaveBeenCalledOnce()
    })

    it('logs info', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).toHaveBeenCalledOnce()
    })

    it('logs warn', async () => {
      const logger = await getLogger('T')
      logger.warn('w')
      expect(warnSpy).toHaveBeenCalledOnce()
    })

    it('logs error', async () => {
      const logger = await getLogger('T')
      logger.error('e')
      expect(errorSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── LOG_LEVEL=info ────────────────────────────────────────────────────────

  describe('LOG_LEVEL=info', () => {
    beforeEach(() => {
      vi.stubEnv('LOG_LEVEL', 'info')
      vi.resetModules()
    })

    it('suppresses debug', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('logs info', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).toHaveBeenCalledOnce()
    })

    it('logs warn', async () => {
      const logger = await getLogger('T')
      logger.warn('w')
      expect(warnSpy).toHaveBeenCalledOnce()
    })

    it('logs error', async () => {
      const logger = await getLogger('T')
      logger.error('e')
      expect(errorSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── LOG_LEVEL=warn ────────────────────────────────────────────────────────

  describe('LOG_LEVEL=warn', () => {
    beforeEach(() => {
      vi.stubEnv('LOG_LEVEL', 'warn')
      vi.resetModules()
    })

    it('suppresses debug', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('suppresses info', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('logs warn', async () => {
      const logger = await getLogger('T')
      logger.warn('w')
      expect(warnSpy).toHaveBeenCalledOnce()
    })

    it('logs error', async () => {
      const logger = await getLogger('T')
      logger.error('e')
      expect(errorSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── LOG_LEVEL=error ───────────────────────────────────────────────────────

  describe('LOG_LEVEL=error', () => {
    beforeEach(() => {
      vi.stubEnv('LOG_LEVEL', 'error')
      vi.resetModules()
    })

    it('suppresses debug', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('suppresses info', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).not.toHaveBeenCalled()
    })

    it('suppresses warn', async () => {
      const logger = await getLogger('T')
      logger.warn('w')
      expect(warnSpy).not.toHaveBeenCalled()
    })

    it('logs error', async () => {
      const logger = await getLogger('T')
      logger.error('e')
      expect(errorSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── error always logs regardless of level ─────────────────────────────────

  it('error logs even when LOG_LEVEL=warn', async () => {
    vi.stubEnv('LOG_LEVEL', 'warn')
    vi.resetModules()
    const logger = await getLogger('T')
    logger.error('always')
    expect(errorSpy).toHaveBeenCalledOnce()
  })

  // ─── unknown LOG_LEVEL falls back to info ─────────────────────────────────

  describe('unknown LOG_LEVEL falls back to info', () => {
    beforeEach(() => {
      vi.stubEnv('LOG_LEVEL', 'verbose')
      vi.resetModules()
    })

    it('suppresses debug', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('logs info', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── NODE_ENV-based defaults (no explicit LOG_LEVEL) ──────────────────────
  // LOG_LEVEL must be truly absent (undefined), not set to ''.
  // vi.stubEnv sets a string value so we delete it manually and restore in afterEach.

  describe('NODE_ENV=development default → debug level', () => {
    let savedLogLevel: string | undefined

    beforeEach(() => {
      savedLogLevel = process.env.LOG_LEVEL
      delete process.env.LOG_LEVEL
      vi.stubEnv('NODE_ENV', 'development')
      vi.resetModules()
    })

    afterEach(() => {
      if (savedLogLevel !== undefined) process.env.LOG_LEVEL = savedLogLevel
    })

    it('logs debug when NODE_ENV=development and LOG_LEVEL unset', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).toHaveBeenCalledOnce()
    })
  })

  describe('NODE_ENV=production default → info level', () => {
    let savedLogLevel: string | undefined

    beforeEach(() => {
      savedLogLevel = process.env.LOG_LEVEL
      delete process.env.LOG_LEVEL
      vi.stubEnv('NODE_ENV', 'production')
      vi.resetModules()
    })

    afterEach(() => {
      if (savedLogLevel !== undefined) process.env.LOG_LEVEL = savedLogLevel
    })

    it('suppresses debug when NODE_ENV=production and LOG_LEVEL unset', async () => {
      const logger = await getLogger('T')
      logger.debug('d')
      expect(debugSpy).not.toHaveBeenCalled()
    })

    it('logs info when NODE_ENV=production and LOG_LEVEL unset', async () => {
      const logger = await getLogger('T')
      logger.info('i')
      expect(infoSpy).toHaveBeenCalledOnce()
    })
  })

  // ─── falsy data values passed through ─────────────────────────────────────

  it('passes 0 as data (not replaced with empty string)', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('Test')

    logger.info('count', 0)

    expect(infoSpy).toHaveBeenCalledWith('[Test] count', 0)
  })

  it('passes false as data (not replaced with empty string)', async () => {
    vi.stubEnv('LOG_LEVEL', 'debug')
    vi.resetModules()
    const logger = await getLogger('Test')

    logger.warn('flag', false)

    expect(warnSpy).toHaveBeenCalledWith('[Test] flag', false)
  })
})

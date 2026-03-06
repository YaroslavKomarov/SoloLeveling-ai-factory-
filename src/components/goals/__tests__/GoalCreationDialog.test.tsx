/**
 * Tests for GoalCreationDialog:
 * - Phase rendering (gathering, quests, planning, preview, confirmed, synthesis)
 * - isReadyToGenerate: placeholder text changes, text reply skips agent call
 * - handleClose fires DELETE to clear DB messages (fix for stale synthesis message)
 * - handleClose fires DELETE from any phase
 * - DELETE failure doesn't block dialog close
 * - handleClose doesn't fire DELETE when sphereId is null
 * - loadMessages: fetches existing messages on open
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { GoalCreationDialog } from '../GoalCreationDialog'

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
    button: ({
      children,
      whileHover: _wh,
      whileTap: _wt,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileHover?: unknown; whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/tasks/spaced-repetition', () => ({
  generateGoalPlan: vi.fn(() => ({ tasks: [], totalDays: 90 })),
}))

vi.mock('../PlanPreview', () => ({
  PlanPreview: () => <div data-testid="plan-preview" />,
}))

// ── Store helpers ──────────────────────────────────────────────────────────────

const mockReset = vi.fn()
const mockCloseDialog = vi.fn()
const mockSetPhase = vi.fn()
const mockAddMessage = vi.fn()
const mockSetStreamingMessage = vi.fn()
const mockFinalizeStreamingMessage = vi.fn()
const mockSetDraftQuests = vi.fn()
const mockSetDraftGoalType = vi.fn()
const mockSetPlanResult = vi.fn()
const mockSetLoading = vi.fn()
const mockSetError = vi.fn()
const mockSetSynthesisNote = vi.fn()
const mockSetCreatedGoalId = vi.fn()

function makeStoreState(overrides: Record<string, unknown> = {}) {
  return {
    isOpen: true,
    sphereId: 'sphere-1',
    phase: 'gathering',
    messages: [],
    draftGoalType: 'skill',
    draftQuests: [],
    planResult: null,
    isLoading: false,
    error: null,
    synthesisNote: null,
    createdGoalId: null,
    setPhase: mockSetPhase,
    addMessage: mockAddMessage,
    setStreamingMessage: mockSetStreamingMessage,
    finalizeStreamingMessage: mockFinalizeStreamingMessage,
    setDraftQuests: mockSetDraftQuests,
    setDraftGoalType: mockSetDraftGoalType,
    setPlanResult: mockSetPlanResult,
    setLoading: mockSetLoading,
    setError: mockSetError,
    setSynthesisNote: mockSetSynthesisNote,
    setCreatedGoalId: mockSetCreatedGoalId,
    closeDialog: mockCloseDialog,
    reset: mockReset,
    ...overrides,
  }
}

vi.mock('@/store/goal-dialog', () => ({
  useGoalDialogStore: vi.fn(),
}))

vi.mock('@/store/goals', () => ({
  useGoalsStore: vi.fn(() => vi.fn()),
}))

// ── Fetch helpers ──────────────────────────────────────────────────────────────

const emptyHistoryFetch = { ok: true, body: null, json: () => Promise.resolve({ messages: [] }) }

type FetchStub = { ok: boolean; body?: unknown; json?: () => Promise<unknown> }

function stubFetch(...responses: FetchStub[]) {
  let call = 0
  return vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const resp: FetchStub = responses[call] ?? responses[responses.length - 1] ?? emptyHistoryFetch
      call++
      return Promise.resolve({ ok: resp.ok, status: resp.ok ? 200 : 500, body: resp.body ?? null, json: resp.json ?? (() => Promise.resolve({})) })
    })
  )
}

// ── Import mocked store ────────────────────────────────────────────────────────

const { useGoalDialogStore } = await import('@/store/goal-dialog')

beforeEach(() => {
  vi.clearAllMocks()
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

// ── Phase rendering tests ──────────────────────────────────────────────────────

describe('GoalCreationDialog — phase rendering', () => {
  it('gathering phase: shows empty placeholder when no messages', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getByText(/Describe your goal/i)).toBeDefined()
    expect(screen.getByPlaceholderText(/Describe your goal/i)).toBeDefined()
  })

  it('gathering phase: renders messages from store', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({
      messages: [
        { role: 'user', content: 'Learn Rust', isStreaming: false },
        { role: 'assistant', content: 'Great goal!', isStreaming: false },
      ],
    }) as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getByText('Learn Rust')).toBeDefined()
    expect(screen.getByText('Great goal!')).toBeDefined()
  })

  it('gathering phase: textarea placeholder changes when isReadyToGenerate', () => {
    // isReadyToGenerate is internal state — test via tool-output-available event
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const toolOutputChunk =
      'data: {"type":"tool-output-available","output":{"phase":"quests","goalType":"skill"}}\n'

    let readCount = 0
    const streamBody = {
      getReader: () => ({
        read: vi.fn().mockImplementation(() => {
          if (readCount === 0) {
            readCount++
            return Promise.resolve({ done: false, value: new TextEncoder().encode(toolOutputChunk) })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }),
    }

    stubFetch(emptyHistoryFetch, { ok: true, body: streamBody })

    render(<GoalCreationDialog />)

    const textarea = screen.getByPlaceholderText(/Describe your goal/i)
    fireEvent.change(textarea, { target: { value: 'I want to learn Rust' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    return waitFor(() => {
      expect(screen.getByPlaceholderText(/Reply to confirm/i)).toBeDefined()
    })
  })

  it('preview phase: renders PlanPreview and Continue button', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({
      phase: 'preview',
      planResult: { tasks: [], totalDays: 90 },
    }) as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getByTestId('plan-preview')).toBeDefined()
    expect(screen.getByText(/Continue/i)).toBeDefined()
  })

  it('confirmed phase: shows Goal Created text, no action buttons', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'confirmed' }) as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getAllByText(/Goal Created/i).length).toBeGreaterThan(0)
    expect(screen.getByText(/Your 90-day journey begins/i)).toBeDefined()
    // No Create/Skip/Save buttons in this phase
    expect(screen.queryByText(/Create summary note/i)).toBeNull()
    expect(screen.queryByText(/Skip/i)).toBeNull()
    expect(screen.queryByText(/Save note/i)).toBeNull()
  })

  it('confirmed phase: shows "Saving summary note..." while loading', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'confirmed', isLoading: true }) as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getByText(/Saving summary note/i)).toBeDefined()
  })

  it('synthesis phase: shows "Creating summary note..." (no user interaction)', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'synthesis' }) as never)
    stubFetch(emptyHistoryFetch)

    render(<GoalCreationDialog />)

    expect(screen.getByText(/Creating summary note/i)).toBeDefined()
    // No input or buttons in synthesis phase
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

// ── isReadyToGenerate: user text reply ─────────────────────────────────────────

describe('GoalCreationDialog — isReadyToGenerate user reply', () => {
  it('text reply after isReadyToGenerate calls setPhase("planning") and fires generateQuests fetch', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const toolOutputChunk =
      'data: {"type":"tool-output-available","output":{"phase":"quests","goalType":"skill"}}\n'

    let readCount = 0
    const streamBody = {
      getReader: () => ({
        read: vi.fn().mockImplementation(() => {
          if (readCount === 0) {
            readCount++
            return Promise.resolve({ done: false, value: new TextEncoder().encode(toolOutputChunk) })
          }
          return Promise.resolve({ done: true, value: undefined })
        }),
      }),
    }

    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }), body: null })   // GET loadMessages
      .mockResolvedValueOnce({ ok: true, body: streamBody, json: () => Promise.resolve({}) })           // POST agent (sets isReadyToGenerate)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ toolResult: { phase: 'planning', quests: [] } }), body: null }) // POST generateQuests
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    // First message — triggers agent, which returns readyToGenerateQuests
    const textarea = screen.getByPlaceholderText(/Describe your goal/i)
    fireEvent.change(textarea, { target: { value: 'I want to learn Rust' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    // Wait for isReadyToGenerate to be set (placeholder changes)
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Reply to confirm/i)).toBeDefined()
    })

    const fetchCallCountBefore = fetchMock.mock.calls.length

    // Second message — should call setPhase('planning') and fire generateQuests fetch
    const confirmTextarea = screen.getByPlaceholderText(/Reply to confirm/i)
    fireEvent.change(confirmTextarea, { target: { value: 'Looks good' } })
    fireEvent.keyDown(confirmTextarea, { key: 'Enter', shiftKey: false })

    expect(mockSetPhase).toHaveBeenCalledWith('planning')
    await waitFor(() => {
      expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchCallCountBefore)
    })
  })
})

// ── [FIX] handleClose clears DB dialog messages ────────────────────────────────

describe('GoalCreationDialog — [FIX] handleClose fires DELETE to clear stale messages', () => {
  it('fires DELETE /api/agents/goal-generator?sphereId=... on close', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }), body: null })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }), body: null })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    const closeBtn = document.querySelector('button[style*="background: none"]') as HTMLButtonElement
    expect(closeBtn).not.toBeNull()
    fireEvent.click(closeBtn)

    await waitFor(() => {
      const deleteCalls = (fetchMock.mock.calls as [string, RequestInit][])
        .filter(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCalls.length).toBeGreaterThan(0)
      const [url] = deleteCalls[0]!
      expect(url).toContain('/api/agents/goal-generator')
      expect(url).toContain('sphereId=sphere-1')
    })

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })

  it('fires DELETE from planning phase (not just gathering)', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'planning' }) as never
    )

    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }), body: null })
      .mockResolvedValue({ ok: true, json: () => Promise.resolve({ ok: true }), body: null })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    const closeBtn = document.querySelector('button[style*="background: none"]') as HTMLButtonElement
    fireEvent.click(closeBtn)

    await waitFor(() => {
      const deleteCalls = (fetchMock.mock.calls as [string, RequestInit][])
        .filter(([, opts]) => opts?.method === 'DELETE')
      expect(deleteCalls.length).toBeGreaterThan(0)
    })

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })

  it('still closes dialog immediately even when DELETE request fails', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const fetchMock = vi.fn()
    fetchMock
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ messages: [] }), body: null })
      .mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    const closeBtn = document.querySelector('button[style*="background: none"]') as HTMLButtonElement
    fireEvent.click(closeBtn)

    // reset and closeDialog are called synchronously — DELETE is fire-and-forget
    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })

  it('does NOT fire DELETE when sphereId is null', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ sphereId: null }) as never
    )

    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}), body: null })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    const closeBtn = document.querySelector('button[style*="background: none"]') as HTMLButtonElement
    fireEvent.click(closeBtn)

    const deleteCalls = (fetchMock.mock.calls as [string, RequestInit][])
      .filter(([, opts]) => opts?.method === 'DELETE')
    expect(deleteCalls).toHaveLength(0)

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })
})

// ── loadMessages on open ───────────────────────────────────────────────────────

describe('GoalCreationDialog — loadMessages', () => {
  it('on open, fetches GET /api/agents/goal-generator?sphereId=...', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [] }),
      body: null,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    await waitFor(() => {
      const getCall = (fetchMock.mock.calls as [string, RequestInit | undefined][])
        .find(([url, opts]) => url.includes('goal-generator') && (!opts || opts.method === undefined || opts.method === 'GET'))
      expect(getCall).toBeDefined()
      expect(getCall![0]).toContain('sphereId=sphere-1')
    })
  })

  it('populates messages store when history exists', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const existingMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ]

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: existingMessages }),
      body: null,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    await waitFor(() => {
      expect(mockAddMessage).toHaveBeenCalledTimes(2)
      expect(mockAddMessage).toHaveBeenCalledWith({ role: 'user', content: 'Hello' })
      expect(mockAddMessage).toHaveBeenCalledWith({ role: 'assistant', content: 'Hi there' })
    })
  })

  it('does not call addMessage when history is empty', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState() as never)

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ messages: [] }),
      body: null,
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GoalCreationDialog />)

    // Wait a tick for loadMessages to complete
    await act(async () => {
      await new Promise(r => setTimeout(r, 50))
    })

    expect(mockAddMessage).not.toHaveBeenCalled()
  })
})

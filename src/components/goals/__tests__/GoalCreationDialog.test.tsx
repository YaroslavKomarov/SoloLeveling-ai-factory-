/**
 * Tests for GoalCreationDialog synthesis flow (T06):
 * - Confirmed phase shows "Create summary note" button
 * - Clicking synthesis button triggers agent call
 * - tool-output-available with phase='synthesis' transitions to synthesis phase
 * - Synthesis phase shows editable textarea with note content
 * - "Save note" button calls POST /api/notes/goal/{goalId}
 * - "Skip" button closes dialog without creating note
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
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
    button: ({ children, whileHover: _wh, whileTap: _wt, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileHover?: unknown; whileTap?: unknown }) => (
      <button {...props}>{children}</button>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock('@/lib/tasks/spaced-repetition', () => ({
  generateGoalPlan: vi.fn(() => ({ tasks: [], totalDays: 90 })),
}))

vi.mock('./QuestEditor', () => ({
  QuestEditor: () => <div data-testid="quest-editor" />,
}))

vi.mock('./PlanPreview', () => ({
  PlanPreview: () => <div data-testid="plan-preview" />,
}))

// ── Store mock setup ───────────────────────────────────────────────────────────

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
    phase: 'confirmed',
    messages: [],
    draftGoalType: 'skill',
    draftQuests: [],
    planResult: null,
    isLoading: false,
    error: null,
    synthesisNote: null,
    createdGoalId: 'goal-1',
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

/** Reusable GET /api/agents/goal-generator response (returns empty message history) */
const emptyHistoryResponse = {
  ok: true,
  body: null,
  json: () => Promise.resolve({ messages: [] }),
}

/** Creates a minimal streaming body that returns one chunk then completes */
function makeStreamBody(chunkData: string) {
  let readCount = 0
  return {
    getReader: () => ({
      read: vi.fn().mockImplementation(() => {
        if (readCount === 0) {
          readCount++
          return Promise.resolve({ done: false, value: new TextEncoder().encode(chunkData) })
        }
        return Promise.resolve({ done: true, value: undefined })
      }),
    }),
  }
}

function mockFetchResponses(responses: Array<{ ok: boolean; body?: unknown; json?: () => Promise<unknown> }>) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const resp = responses[call] ?? responses[responses.length - 1]
      call++
      const response = {
        ok: resp.ok,
        status: resp.ok ? 200 : 500,
        body: resp.body ?? null,
        json: resp.json ?? (() => Promise.resolve({})),
      }
      return Promise.resolve(response)
    })
  )
}

// ── Test setup ─────────────────────────────────────────────────────────────────

const { useGoalDialogStore } = await import('@/store/goal-dialog')

beforeEach(() => {
  vi.clearAllMocks()
  // jsdom doesn't implement scrollIntoView — stub it to avoid errors in gathering phase
  window.HTMLElement.prototype.scrollIntoView = vi.fn()
})

// ── Tests ──────────────────────────────────────────────────────────────────────

// ── T07: progressive disclosure tests ─────────────────────────────────────────

describe('GoalCreationDialog — T07: progressive disclosure for Generate Goal button', () => {
  it('Generate Goal Plan button is not visible initially in gathering phase', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'gathering', messages: [] }) as never
    )
    mockFetchResponses([emptyHistoryResponse])

    render(<GoalCreationDialog />)

    expect(screen.queryByText(/Generate Goal Plan/i)).toBeNull()
  })

  it('Generate Goal Plan button appears after readyToGenerateQuests tool-output-available stream event', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'gathering', messages: [] }) as never
    )

    const toolOutputChunk =
      'data: {"type":"tool-output-available","output":{"phase":"quests","goalType":"skill","goalSummary":"Learn Python","rationaleForType":"Practice-based"}}\n'

    mockFetchResponses([
      emptyHistoryResponse,
      { ok: true, body: makeStreamBody(toolOutputChunk) },
    ])

    render(<GoalCreationDialog />)

    // Type and send a message to trigger the agent call
    const textarea = screen.getByPlaceholderText(/Describe your goal/i)
    fireEvent.change(textarea, { target: { value: 'I want to learn Python' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByText(/Generate Goal Plan/i)).toBeDefined()
    })
  })

  it('clicking Generate Goal Plan button calls setPhase with quests', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'gathering', messages: [] }) as never
    )

    const toolOutputChunk =
      'data: {"type":"tool-output-available","output":{"phase":"quests","goalType":"skill","goalSummary":"Learn Python","rationaleForType":"Practice-based"}}\n'

    mockFetchResponses([
      emptyHistoryResponse,
      { ok: true, body: makeStreamBody(toolOutputChunk) },
    ])

    render(<GoalCreationDialog />)

    // Trigger the agent to call readyToGenerateQuests
    const textarea = screen.getByPlaceholderText(/Describe your goal/i)
    fireEvent.change(textarea, { target: { value: 'I want to learn Python' } })
    fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false })

    await waitFor(() => {
      expect(screen.getByText(/Generate Goal Plan/i)).toBeDefined()
    })

    // Click the revealed button
    fireEvent.click(screen.getByText(/Generate Goal Plan/i))

    expect(mockSetPhase).toHaveBeenCalledWith('quests')
  })

  it('closing dialog calls reset and closeDialog (cancel path)', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'gathering', messages: [] }) as never
    )
    mockFetchResponses([emptyHistoryResponse])

    render(<GoalCreationDialog />)

    // Click the X close button
    const closeBtn = document.querySelector('button[style*="background: none"]') as HTMLButtonElement
    if (closeBtn) fireEvent.click(closeBtn)

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })
})

// ── Confirmed phase tests ──────────────────────────────────────────────────────

describe('GoalCreationDialog — confirmed phase', () => {
  it('shows "Goal Created" and synthesis offer button', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'confirmed' }) as never)

    render(<GoalCreationDialog />)

    expect(screen.getByText('Goal Created')).toBeDefined()
    expect(screen.getByText(/Create summary note/i)).toBeDefined()
    expect(screen.getByText(/Skip/i)).toBeDefined()
  })

  it('skip button calls reset and closeDialog', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'confirmed' }) as never)

    render(<GoalCreationDialog />)

    const skipButton = screen.getAllByText(/Skip/i)[0]!
    fireEvent.click(skipButton)

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })

  it('"Create summary note" button sends synthesis request to agent', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(makeStoreState({ phase: 'confirmed' }) as never)

    // 1st call: initial GET for message history; 2nd call: POST to agent (streaming)
    mockFetchResponses([
      emptyHistoryResponse,
      {
        ok: true,
        body: makeStreamBody('data: {"type":"text-delta","delta":"Working..."}\n'),
      },
    ])

    render(<GoalCreationDialog />)

    const synthesisBtn = screen.getByText(/Create summary note/i)
    fireEvent.click(synthesisBtn)

    await waitFor(() => {
      // 2 calls: initial GET + synthesis POST
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })

    // Verify the message added to the store contains a request for a note/summary
    expect(mockAddMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        role: 'user',
        content: expect.stringMatching(/summar|note/i),
      })
    )
  })
})

describe('GoalCreationDialog — synthesis phase', () => {
  const synthesisNote = {
    title: 'Goal Planning Insights — Python',
    content: '## Goal Summary\nLearn Python data analysis.\n\n## Key Decisions\n- 4 quests\n',
  }

  it('shows note title, editable textarea, and action buttons', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'synthesis', synthesisNote }) as never
    )

    render(<GoalCreationDialog />)

    expect(screen.getByText(/Goal Planning Insights — Python/i)).toBeDefined()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('## Goal Summary')
    expect(screen.getByText(/Save note/i)).toBeDefined()
  })

  it('save note button calls POST /api/notes/goal/{goalId} and closes dialog', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'synthesis', synthesisNote, createdGoalId: 'goal-42' }) as never
    )

    // 1st: initial GET; 2nd: POST to /api/notes/goal/{goalId}
    mockFetchResponses([
      emptyHistoryResponse,
      { ok: true, json: () => Promise.resolve({ note: { id: 'note-1' } }) },
    ])

    render(<GoalCreationDialog />)

    const saveBtn = screen.getByText(/Save note/i)
    fireEvent.click(saveBtn)

    await waitFor(() => {
      expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2)
    })

    const fetchCalls = (vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls as [string, RequestInit][]
    const noteCall = fetchCalls.find(([url]) => url.includes('/api/notes/'))
    expect(noteCall).toBeDefined()
    expect(noteCall![0]).toBe('/api/notes/goal/goal-42')
    expect(noteCall![1].method).toBe('POST')

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledOnce()
      expect(mockCloseDialog).toHaveBeenCalledOnce()
    })
  })

  it('skip button in synthesis phase closes dialog without POST to notes', async () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'synthesis', synthesisNote }) as never
    )

    mockFetchResponses([emptyHistoryResponse])

    render(<GoalCreationDialog />)

    const skipBtn = screen.getByText(/Skip/i)
    fireEvent.click(skipBtn)

    // No call to /api/notes — only the initial history GET
    const fetchCalls = (vi.mocked(global.fetch) as ReturnType<typeof vi.fn>).mock.calls as [string][]
    const notesCalls = fetchCalls.filter(([url]) => url.includes('/api/notes/'))
    expect(notesCalls).toHaveLength(0)

    expect(mockReset).toHaveBeenCalledOnce()
    expect(mockCloseDialog).toHaveBeenCalledOnce()
  })

  it('save button is disabled when content is empty', () => {
    vi.mocked(useGoalDialogStore).mockReturnValue(
      makeStoreState({ phase: 'synthesis', synthesisNote: { title: 'T', content: '' } }) as never
    )

    render(<GoalCreationDialog />)

    const saveBtn = screen.getByText(/Save note/i).closest('button')
    expect(saveBtn?.disabled).toBe(true)
  })
})

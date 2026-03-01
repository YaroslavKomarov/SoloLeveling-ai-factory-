/**
 * Knowledge RAG agent — semantic search + wikilinks graph traversal.
 * Uses claude-haiku-4-5-20251001 for fast, cost-effective responses.
 * Streams the response for real-time UI updates.
 */
import { streamText } from 'ai'
import { getFastModel } from '@/lib/ai/provider'
import { createLogger } from '@/lib/logger'
import { KNOWLEDGE_RAG_SYSTEM_PROMPT } from './prompt'
import { searchNotes, getNoteContent, getBacklinkedNotes, listAllNotes } from './tools'

const logger = createLogger('KnowledgeRag')

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Runs the knowledge-rag agent for a user query.
 * Returns the Vercel AI SDK result object for streaming.
 */
export async function runKnowledgeRag(
  userId: string,
  query: string,
  conversationHistory: ChatMessage[]
) {
  const startTime = Date.now()
  logger.info('Knowledge RAG agent starting', {
    userId,
    queryLength: query.length,
    historyMessages: conversationHistory.length,
  })

  // Build messages: inject userId into a user context message, then history
  const systemWithContext = `${KNOWLEDGE_RAG_SYSTEM_PROMPT}\n\n## Current User\nUser ID: ${userId}\n\nAlways pass this userId to searchNotes and getBacklinkedNotes tools.`

  // Map conversation history to AI SDK message format
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user' as const, content: query },
  ]

  logger.debug('Invoking knowledge-rag agent', {
    userId,
    messageCount: messages.length,
    queryPreview: query.slice(0, 100),
  })

  try {
    const result = streamText({
      model: getFastModel(),
      system: systemWithContext,
      messages,
      tools: {
        searchNotes,
        getNoteContent,
        getBacklinkedNotes,
        listAllNotes,
      },
      maxSteps: 6,
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return
        for (const toolResult of toolResults) {
          logger.debug('Tool call completed', {
            userId,
            toolName: toolResult.toolName,
          })
        }
      },
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('Knowledge RAG agent complete', {
          userId,
          durationMs,
          tokenUsage: usage,
        })
      },
    })

    return result

  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('Knowledge RAG agent failed', {
      userId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}

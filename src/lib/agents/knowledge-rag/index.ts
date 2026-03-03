/**
 * Knowledge RAG agent — semantic search + wikilinks graph traversal.
 * Uses claude-haiku-4-5-20251001 for fast, cost-effective responses.
 * Streams the response for real-time UI updates.
 *
 * Session support: accepts DB messages + sessionId, runs context compression
 * at 80+ non-compressed messages (summarizes oldest 40 via haiku).
 */
import { streamText, generateText } from 'ai'
import { getFastModel } from '@/lib/ai/provider'
import { createClient } from '@/lib/supabase/server'
import { createLogger } from '@/lib/logger'
import { KNOWLEDGE_RAG_SYSTEM_PROMPT } from './prompt'
import { searchNotes, getNoteContent, getBacklinkedNotes, listAllNotes } from './tools'

const logger = createLogger('KnowledgeRag')

const COMPRESSION_THRESHOLD = 80
const COMPRESSION_BATCH = 40

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** Message shape as stored in DB (kb_chat_messages row). */
export interface KbChatDbMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  isCompressedSummary: boolean
}

/**
 * Compress oldest 40 non-compressed messages into a single summary stored in DB.
 * Returns updated messages array with compression applied.
 * Fails gracefully — if anything goes wrong, returns original messages unmodified.
 */
export async function compressIfNeeded(
  sessionId: string,
  userId: string,
  messages: KbChatDbMessage[]
): Promise<KbChatDbMessage[]> {
  const nonCompressed = messages.filter((m) => !m.isCompressedSummary)

  if (nonCompressed.length < COMPRESSION_THRESHOLD) {
    logger.debug('[KnowledgeRag] No compression needed', {
      sessionId,
      nonCompressedCount: nonCompressed.length,
    })
    return messages
  }

  logger.info('[KnowledgeRag] Compression triggered', {
    sessionId,
    nonCompressedCount: nonCompressed.length,
    threshold: COMPRESSION_THRESHOLD,
    batch: COMPRESSION_BATCH,
  })

  const toCompress = nonCompressed.slice(0, COMPRESSION_BATCH)
  const conversationText = toCompress
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n')

  let summaryContent: string
  try {
    const { text } = await generateText({
      model: getFastModel(),
      messages: [
        {
          role: 'user',
          content: `Summarize this knowledge base conversation excerpt concisely, preserving key facts, topics discussed, decisions, and important context:\n\n${conversationText}`,
        },
      ],
    })
    summaryContent = text
    logger.debug('[KnowledgeRag] Compression summary generated', {
      sessionId,
      summaryLength: summaryContent.length,
    })
  } catch (err) {
    logger.error('[KnowledgeRag] Compression summarization failed — skipping', {
      sessionId,
      error: String(err),
    })
    return messages
  }

  const supabase = await createClient()
  const toCompressIds = toCompress.map((m) => m.id)

  const { error: deleteError } = await supabase
    .from('kb_chat_messages')
    .delete()
    .in('id', toCompressIds)

  if (deleteError) {
    logger.error('[KnowledgeRag] Failed to delete compressed messages — skipping', {
      sessionId,
      error: deleteError.message,
    })
    return messages
  }

  const { data: summaryRow, error: summaryInsertError } = await supabase
    .from('kb_chat_messages')
    .insert({
      session_id: sessionId,
      user_id: userId,
      role: 'assistant',
      content: summaryContent,
      is_compressed_summary: true,
    })
    .select('id')
    .single()

  if (summaryInsertError || !summaryRow) {
    logger.error('[KnowledgeRag] Failed to insert summary after deleting old messages — returning remaining context', {
      sessionId,
      error: summaryInsertError?.message,
    })
    // Messages already deleted from DB — return only existing summaries + remaining non-compressed
    return [...messages.filter((m) => m.isCompressedSummary), ...nonCompressed.slice(COMPRESSION_BATCH)]
  }

  logger.info('[KnowledgeRag] Compression complete', {
    sessionId,
    deletedCount: toCompressIds.length,
    summaryId: summaryRow?.id,
  })

  // Rebuild messages: existing summaries + new summary + remaining non-compressed
  const existingSummaries = messages.filter((m) => m.isCompressedSummary)
  const remaining = nonCompressed.slice(COMPRESSION_BATCH)

  const newSummary: KbChatDbMessage = {
    id: summaryRow?.id ?? 'compressed',
    role: 'assistant',
    content: summaryContent,
    isCompressedSummary: true,
  }

  return [...existingSummaries, newSummary, ...remaining]
}

/**
 * Runs the knowledge-rag agent for a user query within a persistent session.
 * Triggers compression if non-compressed message count >= 80.
 * Returns the Vercel AI SDK result object for streaming.
 */
export async function runKnowledgeRag(params: {
  userId: string
  query: string
  sessionId: string
  messages: KbChatDbMessage[]
}) {
  const { userId, query, sessionId, messages } = params
  const startTime = Date.now()

  logger.info('[KnowledgeRag] agent starting', {
    userId,
    sessionId,
    queryLength: query.length,
    historyMessages: messages.length,
  })

  // Compress context if over threshold (modifies DB, returns updated messages)
  const processedMessages = await compressIfNeeded(sessionId, userId, messages)

  // Build messages for AI SDK: history + current query
  const systemWithContext = `${KNOWLEDGE_RAG_SYSTEM_PROMPT}\n\n## Current User\nUser ID: ${userId}\n\nAlways pass this userId to searchNotes and getBacklinkedNotes tools.`

  const aiMessages = [
    ...processedMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: query },
  ]

  logger.debug('[KnowledgeRag] invoking agent', {
    userId,
    sessionId,
    messageCount: aiMessages.length,
    queryPreview: query.slice(0, 100),
  })

  try {
    const result = streamText({
      model: getFastModel(),
      system: systemWithContext,
      messages: aiMessages,
      tools: {
        searchNotes,
        getNoteContent,
        getBacklinkedNotes,
        listAllNotes,
      },
      // [FIX] AI SDK v6 renamed maxSteps → stopWhen. maxSteps: 6 was silently ignored,
      // causing the loop to stop after 1 step (tool call only, no text response).
      stopWhen: ({ steps }) => steps.length >= 6,
      onStepFinish: ({ toolResults }) => {
        if (!toolResults) return
        for (const toolResult of toolResults) {
          logger.debug('[KnowledgeRag] tool call completed', {
            userId,
            sessionId,
            toolName: toolResult.toolName,
          })
        }
      },
      onFinish: ({ usage }) => {
        const durationMs = Date.now() - startTime
        logger.info('[KnowledgeRag] agent complete', {
          userId,
          sessionId,
          durationMs,
          tokenUsage: usage,
        })
      },
    })

    return result

  } catch (error) {
    const durationMs = Date.now() - startTime
    logger.error('[KnowledgeRag] agent failed', {
      userId,
      sessionId,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
    })
    throw error
  }
}

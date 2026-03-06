/**
 * Shared constants for the knowledge-rag agent.
 * Kept in a separate file so client components can import them
 * without pulling in server-only modules (tools, Supabase server client).
 */

/**
 * Maximum number of conversation history messages sent to the LLM per request.
 * Older messages beyond this limit are dropped (sliding window).
 */
export const MAX_HISTORY_MESSAGES = 10

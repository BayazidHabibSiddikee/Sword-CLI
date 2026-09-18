/**
 * Agent LLM caller — one model turn routed through the SAME router + provider
 * adapters the /v1 proxy uses (decrypted keys, bandit/sticky routing,
 * failover, rate-limit bookkeeping). Agent turns respect model cooldowns
 * exactly like proxy traffic does.
 *
 * The loop in agent/loop.ts consumes the accumulated assistant message; this
 * module turns "give me one assistant turn" into a streaming async generator
 * of SSE-friendly events, plus the final accumulated tool calls (dialect-
 * rescued, argument-repaired).
 */
import type { ChatCompletionChunk, ChatMessage, ChatToolCall, ChatToolDefinition } from '@freellmapi/shared/types.js';
import { routeRequest, recordRateLimitHit, recordSuccess, type RouteResult } from '../services/router.js';
import {
  recordRequest, recordTokens, setCooldown,
  getCooldownDurationForLimit, PAYMENT_REQUIRED_COOLDOWN_MS, MODEL_FORBIDDEN_COOLDOWN_MS,
} from '../services/ratelimit.js';
import {
  isRetryableError, isPaymentRequiredError, isModelNotFoundError, isModelAccessForbiddenError,
} from '../routes/proxy.js';
import type { JsonSchemaish } from '../lib/tool-args.js';
import { repairToolArguments, toolSchemaMap } from '../lib/tool-args.js';
import {
  rescueInlineToolCalls, startsWithDialectMarker, couldBecomeDialectMarker, containsDialectMarker,
} from '../lib/tool-call-rescue.js';
import { getDb } from '../db/index.js';
import type { AgentSessionRow } from './types.js';

export const AGENT_MAX_RETRIES = 10;

export interface AgentTurnResult {
  /** Accumulated assistant text for this turn. */
  text: string;
  /** Structured tool calls the model wants executed (dialect-rescued, repaired). */
  toolCalls: ChatToolCall[];
  modelId: string;
  platform: string;
}

export type AgentStreamEvent =
  | { kind: 'token'; delta: string }
  | { kind: 'done'; result: AgentTurnResult }
  | { kind: 'error'; message: string; retryable: boolean };

export interface LlmTurnOptions {
  session: AgentSessionRow;
  messages: ChatMessage[];
  tools: ChatToolDefinition[];
  signal: AbortSignal;
  /** Called for each text delta as it arrives (live streaming to the UI). */
  onToken?: (delta: string) => void;
}

/** Resolve the session's pinned model to a models.id, or undefined for auto. */
function resolvePreferredModel(model: string | null): number | undefined {
  if (!model || model === 'auto') return undefined;
  const db = getDb();
  const row = db.prepare('SELECT id FROM models WHERE model_id = ?').get(model) as { id: number } | undefined;
  return row?.id;
}

/**
 * One assistant turn: route → stream → accumulate → rescue dialects → repair
 * arguments. Failover loop mirrors routes/proxy.ts (cooldowns, skip sets,
 * rate-limit bookkeeping) but is deliberately leaner: agent turns get
 * AGENT_MAX_RETRIES attempts, and mid-stream errors are fatal to the turn
 * (the loop surfaces them to the user rather than silently switching models
 * under a running conversation).
 */
export async function* runLlmTurn(opts: LlmTurnOptions): AsyncGenerator<AgentStreamEvent> {
  const { session, messages, tools, signal, onToken } = opts;
  const preferredModel = resolvePreferredModel(session.model);

  const estimatedTokens = messages.reduce((sum, m) => {
    const text = typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? '');
    return sum + Math.ceil(text.length / 4);
  }, 0);

  const skipKeys = new Set<string>();
  const skipModels = new Set<number>();
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < AGENT_MAX_RETRIES; attempt++) {
    if (signal.aborted) {
      yield { kind: 'error', message: 'Agent turn aborted', retryable: false };
      return;
    }
    let route: RouteResult;
    try {
      // requireTools = false: the session's own model (or auto) is used —
      // tool-calling capability is NOT a routing gate. A model that serializes
      // calls as inline text is recovered by the dialect rescue below.
      route = routeRequest(
        estimatedTokens + 4096,
        skipKeys.size > 0 ? skipKeys : undefined,
        preferredModel,
        false,
        false,
        skipModels.size > 0 ? skipModels : undefined,
      );
    } catch (err) {
      const message = (err as Error).message;
      if (lastError) {
        yield {
          kind: 'error',
          message: `All models rate-limited. Last error: ${message}`,
          retryable: true,
        };
      } else {
        yield { kind: 'error', message, retryable: false };
      }
      return;
    }

    const schemas = toolSchemaMap(tools as Array<{ type?: string; function?: { name?: string; parameters?: unknown } }>);
    try {
      const result = await accumulateStreamTurn(route, messages, tools, schemas, signal, onToken);
      // Bookkeeping identical to proxy success paths.
      recordRequest(route.platform, route.modelId, route.keyId);
      recordTokens(route.platform, route.modelId, route.keyId, result.outputChars / 4);
      recordSuccess(route.modelDbId);
      yield {
        kind: 'done',
        result: {
          text: result.text,
          toolCalls: result.toolCalls,
          modelId: route.modelId,
          platform: route.platform,
        },
      };
      return;
    } catch (err) {
      const error = err as Error;
      if (signal.aborted) {
        yield { kind: 'error', message: 'Agent turn aborted', retryable: false };
        return;
      }
      if (isRetryableError(error)) {
        // Model-level 404/403 rule out the whole model for this turn (a sibling
        // key would fail identically) — same bookkeeping as routes/proxy.ts.
        if (isModelNotFoundError(error) || isModelAccessForbiddenError(error)) {
          skipModels.add(route.modelDbId);
        }
        skipKeys.add(`${route.platform}:${route.modelId}:${route.keyId}`);
        setCooldown(
          route.platform, route.modelId, route.keyId,
          isPaymentRequiredError(error)
            ? PAYMENT_REQUIRED_COOLDOWN_MS
            : isModelAccessForbiddenError(error)
            ? MODEL_FORBIDDEN_COOLDOWN_MS
            : getCooldownDurationForLimit(route.platform, route.modelId, route.keyId, {
                rpd: route.rpdLimit, tpd: route.tpdLimit,
              }),
        );
        recordRateLimitHit(route.modelDbId);
        lastError = error;
        console.log(`[agent] ${error.message?.slice(0, 80)} from ${route.displayName}, falling back (attempt ${attempt + 1}/${AGENT_MAX_RETRIES})`);
        continue;
      }
      yield { kind: 'error', message: `Provider error (${route.displayName}): ${error.message}`, retryable: false };
      return;
    }
  }

  yield {
    kind: 'error',
    message: `All models rate-limited after ${AGENT_MAX_RETRIES} attempts. Last: ${lastError?.message ?? 'unknown'}`,
    retryable: true,
  };
}

async function accumulateStreamTurn(
  route: RouteResult,
  messages: ChatMessage[],
  tools: ChatToolDefinition[],
  schemas: Map<string, JsonSchemaish>,
  signal: AbortSignal,
  onToken?: (delta: string) => void,
): Promise<{ text: string; toolCalls: ChatToolCall[]; outputChars: number }> {
  const gen = route.provider.streamChatCompletion(
    route.apiKey, messages, route.modelId,
    { tools, tool_choice: 'auto', parallel_tool_calls: true },
  );

  let text = '';
  const toolCallAcc = new Map<number, { id?: string; name: string; args: string; thought?: string }>();
  let outputChars = 0;
  let finish: string | null = null;

  for await (const chunk of gen) {
    if (signal.aborted) {
      try { await gen.return(undefined); } catch { /* already done */ }
      throw new Error('aborted mid-stream');
    }
    const anyChunk = chunk as Record<string, any>;
    // In-band provider error frame (Groq-style {"error":...} inside a 200 stream).
    if (anyChunk.error && !anyChunk.choices) {
      const msg = anyChunk.error.message ?? JSON.stringify(anyChunk.error).slice(0, 200);
      throw new Error(`in-band provider error from ${route.displayName}: ${msg}`);
    }
    const choice = anyChunk.choices?.[0];
    if (!choice) continue;
    if (choice.finish_reason) finish = choice.finish_reason;

    for (const tc of choice.delta?.tool_calls ?? []) {
      const idx = tc.index ?? 0;
      if (!toolCallAcc.has(idx)) toolCallAcc.set(idx, { name: '', args: '' });
      const acc = toolCallAcc.get(idx)!;
      if (tc.id && !acc.id) acc.id = tc.id;
      if (tc.function?.name) acc.name += tc.function.name;
      if (tc.function?.arguments) acc.args += tc.function.arguments;
      if ((tc as { thought_signature?: string }).thought_signature && !acc.thought) {
        acc.thought = (tc as { thought_signature?: string }).thought_signature;
      }
    }

    const delta = typeof choice.delta?.content === 'string' ? choice.delta.content : '';
    if (delta.length > 0) {
      text += delta;
      outputChars += delta.length;
      onToken?.(delta);
    }
  }

  // Assemble structured calls: synthesize ids, repair double-encoded args.
  let syntheticIds = 0;
  let toolCalls: ChatToolCall[] = [...toolCallAcc.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, acc]) => ({
      id: acc.id && acc.id.length > 0 ? acc.id : `call_stream_${++syntheticIds}`,
      type: 'function' as const,
      function: { name: acc.name, arguments: repairToolArguments(acc.args || '{}', schemas.get(acc.name)) },
      thought_signature: acc.thought,
    }))
    .filter((c) => {
      try { JSON.parse(c.function.arguments); return c.function.name.length > 0; } catch { return false; }
    });

  // Dialect rescue: some models serialize tool calls as inline text
  // (```tool_use ... blocks). Parse them when detected; undecodable text is
  // kept as plain text so the model can recover.
  if (toolCalls.length === 0 && text.trim() && containsDialectMarker(text) && tools.length > 0) {
    const toolNames = new Set(tools.map((t) => t.function.name));
    const rescue = rescueInlineToolCalls(text, toolNames);
    if (rescue.detected) {
      if (rescue.calls) {
        let n = 0;
        for (const c of rescue.calls) {
          toolCalls.push({
            id: `call_rescued_${++n}`,
            type: 'function',
            function: { name: c.name, arguments: repairToolArguments(c.arguments, schemas.get(c.name)) },
          });
        }
        text = rescue.cleanText;
        console.log(`[agent] Rescued ${toolCalls.length} inline tool call(s) from ${route.displayName}`);
      }
      // Unparseable dialect: keep the text as-is; the model will usually
      // retry with structured calls on the next turn.
    }
  }

  // Unused: keep linters quiet about the partial-detection helper imports.
  void startsWithDialectMarker;
  void couldBecomeDialectMarker;

  return { text, toolCalls, outputChars };
}

/** Convenience non-streaming wrapper (used by tests). */
export async function collectLlmTurn(opts: LlmTurnOptions): Promise<AgentStreamEvent[]> {
  const out: AgentStreamEvent[] = [];
  for await (const ev of runLlmTurn(opts)) {
    if (ev.kind !== 'token') out.push(ev);
    if (ev.kind === 'token' && opts.onToken) opts.onToken(ev.delta);
  }
  return out;
}

export type { ChatCompletionChunk };

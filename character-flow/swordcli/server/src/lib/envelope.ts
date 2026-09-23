// Uniform API response envelope for the Business/agent-facing surface.
//
// Shape (additive — legacy keys are preserved at the top level so the existing
// docs/*.html clients keep working unchanged):
//   success: { success: true, ...payload, data: payload }
//   error:   { success: false, error: string, hint?: string, retryable?: boolean }
//
// The `hint` + `retryable` fields implement the agent error-recovery contract
// documented in docs/agent-harness.md: every failure carries a root-cause hint
// and an explicit safe-retry / stop signal.
import type { Response } from 'express';

export function sendOk<T extends Record<string, unknown>>(
  res: Response,
  payload: T,
  status = 200,
): Response {
  return res.status(status).json({ success: true, ...payload, data: payload });
}

export function sendError(
  res: Response,
  status: number,
  error: string,
  opts: { hint?: string; retryable?: boolean } = {},
): Response {
  return res.status(status).json({
    success: false,
    error,
    ...(opts.hint ? { hint: opts.hint } : {}),
    retryable: opts.retryable ?? false,
  });
}

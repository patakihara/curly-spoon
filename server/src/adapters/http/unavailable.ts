/**
 * What a request step makes of a failed upstream call. An upstream that could not be reached, ran
 * out of time, broke (a 5xx) or is limiting calls (a 429) says nothing about the request, so the step
 * throws `StepUnavailable` and the job holds it. A refusal or an answer that makes no sense stays an `AdapterError`, which
 * fails the request.
 */
import { StepUnavailable } from '../../requests/steps.js';
import { AdapterError } from './fetch.js';

const TOO_MANY = 429;

/** The error a step should throw for `error`. Its message names the call, never its URL. */
export function stepFailure(upstream: string, error: unknown): unknown {
  if (!(error instanceof AdapterError)) return error;
  const away =
    error.kind === 'network' ||
    error.kind === 'timeout' ||
    (error.kind === 'status' && ((error.status ?? 0) >= 500 || error.status === TOO_MANY));
  return away ? new StepUnavailable(`${upstream}: ${error.message}`) : error;
}

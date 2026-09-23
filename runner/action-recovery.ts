// How a failed action ends a step. The observation loop already retries a
// changed screen three times before giving up; an action failure had no such
// allowance and ended the whole exploration on its first occurrence, which
// discarded a still-reachable goal. Safety and scope stops stay immediate:
// continuing past them would leave the boundaries the runner enforces.
export const ACTION_RETRY_LIMIT = 3;

/** `consecutive` counts this occurrence, reset by any successful action. */
export function actionOutcome(code: string, consecutive: number): {result: string; terminal: boolean} {
  // A control that ran but changed nothing is an observation about the page,
  // not a tool failure. It is recorded so the choice can be excluded, and the
  // exploration continues with the remaining candidates.
  if (code === 'ACTION_NOOP') return {result: code, terminal: false};
  if (code === 'ACTION_ERROR') return {result: code, terminal: consecutive >= ACTION_RETRY_LIMIT};
  return {result: code, terminal: true};
}

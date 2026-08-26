export type HealthState = 'ok' | 'degraded' | 'down';

export function getOverallHealth(states: HealthState[]): HealthState {
  if (states.includes('down')) return 'down';
  if (states.includes('degraded')) return 'degraded';
  return 'ok';
}

export function getHealthHttpStatus(state: HealthState): number {
  return state === 'down' ? 503 : 200;
}


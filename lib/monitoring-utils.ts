export function monitoringErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (typeof error === 'string') return error.slice(0, 1000);
  return 'Unbekannter Produktionsfehler';
}


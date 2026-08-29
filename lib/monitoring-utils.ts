export function monitoringErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 1000);
  if (typeof error === 'string') return error.slice(0, 1000);

  // Supabase/PostgREST errors are serialised plain objects in browser clients,
  // not Error instances. Keep their diagnostic fields for the private
  // Developer monitor instead of replacing every database error with a
  // generic message.
  if (typeof error === 'object' && error !== null) {
    const value = error as { message?: unknown; details?: unknown; hint?: unknown; code?: unknown };
    const parts = [value.message, value.details, value.hint, value.code]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map((part) => part.trim());
    if (parts.length > 0) return parts.join(' | ').slice(0, 1000);
  }

  return 'Unbekannter Produktionsfehler';
}

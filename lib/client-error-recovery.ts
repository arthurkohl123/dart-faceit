const CHUNK_LOAD_ERROR = /(?:failed to load chunk|loading chunk|chunkloaderror|from module \d+)/i;

/**
 * A deployment can leave an already-open browser tab with an obsolete dynamic
 * import. These errors are recoverable with a fresh document request.
 */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return CHUNK_LOAD_ERROR.test(message);
}

export function getChunkRecoveryUrl(currentUrl: string): string {
  const url = new URL(currentUrl);
  url.searchParams.set('__chunk_retry', String(Date.now()));
  return url.toString();
}

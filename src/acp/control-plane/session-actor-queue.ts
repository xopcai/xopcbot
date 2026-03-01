/**
 * Session Actor Queue
 *
 * Ensures sequential execution of operations per session key.
 * Prevents race conditions when multiple operations target the same session.
 */

export class SessionActorQueue {
  private queueByActor = new Map<string, Promise<unknown>>();

  /**
   * Run an operation for a session key, ensuring sequential execution.
   * Operations for different keys run concurrently.
   * Operations for the same key run sequentially.
   */
  async run<T>(actorKey: string, op: () => Promise<T>): Promise<T> {
    const previous = this.queueByActor.get(actorKey);

    // Chain this operation after the previous one
    const current = (async () => {
      // Wait for previous operation to complete
      if (previous) {
        try {
          await previous;
        } catch {
          // Ignore errors from previous operations
        }
      }
      // Run this operation
      return op();
    })();

    this.queueByActor.set(actorKey, current);

    try {
      const result = await current;
      return result;
    } finally {
      // Clean up if this was the last operation
      if (this.queueByActor.get(actorKey) === current) {
        this.queueByActor.delete(actorKey);
      }
    }
  }

  /**
   * Get the number of pending operations
   */
  getTotalPendingCount(): number {
    return this.queueByActor.size;
  }

  /**
   * Get the tail promise for a session key (for testing)
   */
  getTailMapForTesting(): Map<string, Promise<unknown>> {
    return this.queueByActor;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    this.queueByActor.clear();
  }
}

export class AbortError extends Error {
  constructor(message = 'Aborted') {
    super(message);
    this.name = 'AbortError';
  }
}

export interface AnimationBusOptions {
  getSpeed: () => number;
  isPaused: () => boolean;
  subscribePauseChange: (listener: (paused: boolean) => void) => () => void;
}

export class AnimationBus {
  private getSpeed: () => number;
  private isPaused: () => boolean;
  private pauseListeners = new Set<(paused: boolean) => void>();

  constructor(options: AnimationBusOptions) {
    this.getSpeed = options.getSpeed;
    this.isPaused = options.isPaused;
    options.subscribePauseChange((p) => {
      this.pauseListeners.forEach(fn => fn(p));
    });
  }

  /**
   * Pause-aware, speed-aware, and abortable delay.
   * Efficiently waits without busy-polling.
   */
  async delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new AbortError();
    if (ms <= 0) return;

    let remainingTargetMs = ms;

    while (remainingTargetMs > 0) {
      if (signal?.aborted) throw new AbortError();

      // If paused, wait until resumed or aborted
      if (this.isPaused()) {
        await new Promise<void>((resolve, reject) => {
          const onAbort = () => {
            cleanup();
            reject(new AbortError());
          };
          const onPauseChange = (paused: boolean) => {
            if (!paused) {
              cleanup();
              resolve();
            }
          };
          const cleanup = () => {
            signal?.removeEventListener('abort', onAbort);
            this.pauseListeners.delete(onPauseChange);
          };

          signal?.addEventListener('abort', onAbort);
          this.pauseListeners.add(onPauseChange);
        });
      }

      if (signal?.aborted) throw new AbortError();

      const speed = Math.max(0.1, this.getSpeed());
      // Break into at most 250ms chunks to adapt smoothly to speed changes
      const chunkTargetMs = Math.min(remainingTargetMs, 250);
      const chunkRealMs = chunkTargetMs / speed;

      await new Promise<void>((resolve, reject) => {
        let timerId: ReturnType<typeof setTimeout> | null = null;

        const onAbort = () => {
          cleanup();
          reject(new AbortError());
        };

        const onPauseChange = (paused: boolean) => {
          if (paused) {
            cleanup();
            resolve();
          }
        };

        const cleanup = () => {
          if (timerId !== null) clearTimeout(timerId);
          signal?.removeEventListener('abort', onAbort);
          this.pauseListeners.delete(onPauseChange);
        };

        signal?.addEventListener('abort', onAbort);
        this.pauseListeners.add(onPauseChange);

        timerId = setTimeout(() => {
          cleanup();
          remainingTargetMs -= chunkTargetMs;
          resolve();
        }, chunkRealMs);
      });
    }
  }
}

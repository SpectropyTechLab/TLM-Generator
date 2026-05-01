const AsyncTaskQueue = require('./asyncTaskQueue');

const GEMINI_REQUEST_CONCURRENCY = Math.max(
  1,
  Number(process.env.GEMINI_REQUEST_CONCURRENCY || 1)
);
const GEMINI_MIN_INTERVAL_MS = Math.max(
  0,
  Number(process.env.GEMINI_MIN_INTERVAL_MS || 1500)
);
const GEMINI_429_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.GEMINI_429_COOLDOWN_MS || 20000)
);

class GeminiScheduler {
  constructor() {
    this.queue = new AsyncTaskQueue({
      name: 'gemini',
      concurrency: GEMINI_REQUEST_CONCURRENCY
    });
    this.nextStartAt = 0;
  }

  async schedule(task, metadata = {}) {
    return this.queue.enqueue(async () => {
      await this.waitForTurn();
      try {
        return await task();
      } catch (error) {
        this.handleProviderError(error, metadata);
        throw error;
      }
    }, metadata);
  }

  getStats() {
    return {
      ...this.queue.getStats(),
      nextStartAt: this.nextStartAt
    };
  }

  async waitForTurn() {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextStartAt - now);
    if (waitMs > 0) {
      await this.sleep(waitMs);
    }
    this.nextStartAt = Date.now() + GEMINI_MIN_INTERVAL_MS;
  }

  handleProviderError(error, metadata = {}) {
    const status = Number(error?.status || error?.response?.status || 0);
    if (status !== 429) return;

    const retryAfterMs = this.getRetryAfterMs(error);
    this.nextStartAt = Math.max(this.nextStartAt, Date.now() + retryAfterMs);

    const label = metadata?.label ? ` (${metadata.label})` : '';
    console.warn(
      `[gemini] 429 received${label}; pausing new provider calls for ${retryAfterMs}ms`
    );
  }

  getRetryAfterMs(error) {
    const headerValue = error?.response?.headers?.['retry-after'];
    const seconds = Number(headerValue);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
    return GEMINI_429_COOLDOWN_MS;
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = new GeminiScheduler();

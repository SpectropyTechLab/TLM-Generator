class AsyncTaskQueue {
  constructor({ name, concurrency = 1 } = {}) {
    this.name = name || 'queue';
    this.concurrency = Math.max(1, Number(concurrency) || 1);
    this.pending = [];
    this.activeCount = 0;
  }

  enqueue(task, metadata = {}) {
    if (typeof task !== 'function') {
      return Promise.reject(new Error(`Queue "${this.name}" requires a task function.`));
    }

    return new Promise((resolve, reject) => {
      this.pending.push({
        task,
        metadata,
        resolve,
        reject
      });
      this.drain();
    });
  }

  getStats() {
    return {
      name: this.name,
      concurrency: this.concurrency,
      activeCount: this.activeCount,
      pendingCount: this.pending.length
    };
  }

  drain() {
    while (this.activeCount < this.concurrency && this.pending.length > 0) {
      const item = this.pending.shift();
      this.run(item);
    }
  }

  async run(item) {
    this.activeCount += 1;
    const label = item?.metadata?.label ? ` (${item.metadata.label})` : '';
    try {
      const result = await item.task();
      item.resolve(result);
    } catch (error) {
      item.reject(error);
    } finally {
      this.activeCount -= 1;
      if (item?.metadata?.logLifecycle) {
        const stats = this.getStats();
        console.log(
          `[${this.name}] completed${label}; active=${stats.activeCount}, pending=${stats.pendingCount}`
        );
      }
      this.drain();
    }
  }
}

module.exports = AsyncTaskQueue;

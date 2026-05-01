const AsyncTaskQueue = require('./asyncTaskQueue');

const WORKSHEET_PROCESS_CONCURRENCY = Math.max(
  1,
  Number(process.env.WORKSHEET_PROCESS_CONCURRENCY || 2)
);

class WorksheetProcessingQueue {
  constructor() {
    this.queue = new AsyncTaskQueue({
      name: 'worksheet-processing',
      concurrency: WORKSHEET_PROCESS_CONCURRENCY
    });
  }

  enqueue({ worksheetId, task }) {
    if (!worksheetId) {
      return Promise.reject(new Error('worksheetId is required to enqueue worksheet processing.'));
    }

    console.log(
      `[worksheet-processing] queued ${worksheetId}; active=${this.queue.activeCount}, pending=${this.queue.pending.length + 1}`
    );

    return this.queue.enqueue(task, {
      label: worksheetId,
      logLifecycle: true
    });
  }

  getStats() {
    return this.queue.getStats();
  }
}

module.exports = new WorksheetProcessingQueue();

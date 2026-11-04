import crypto from 'node:crypto';

/**
 * Bounded Job Manager with Concurrency Limits, Timeouts, and Cancellation Support (Section 6).
 */
export class SyncJobManager {
  constructor({ maxConcurrent = 1, maxHistory = 30, defaultTimeoutMs = 90_000 } = {}) {
    this.maxConcurrent = maxConcurrent;
    this.maxHistory = maxHistory;
    this.defaultTimeoutMs = defaultTimeoutMs;
    this.jobs = new Map();
    this.activeCount = 0;
  }

  listJobs() {
    return [...this.jobs.values()].reverse();
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  pruneOldJobs() {
    if (this.jobs.size <= this.maxHistory) return;
    for (const [id, job] of this.jobs.entries()) {
      if (job.status !== 'running' && this.jobs.size > this.maxHistory) {
        this.jobs.delete(id);
      }
    }
  }

  cancelJob(jobId) {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.status === 'running') {
      job.cancelled = true;
      job.status = 'cancelled';
      job.finishedAt = new Date().toISOString();
      if (typeof job.onCancel === 'function') {
        try {
          job.onCancel();
        } catch {
          // Ignore cancellation hook error
        }
      }
    }
    return this.serializeJob(job);
  }

  serializeJob(job) {
    if (!job) return null;
    const { onCancel, ...rest } = job;
    return rest;
  }

  async runBounded(meta, taskFn, { timeoutMs = this.defaultTimeoutMs, onCancel = null } = {}) {
    if (this.activeCount >= this.maxConcurrent) {
      const err = new Error('توجد عملية مزامنة جارية حاليًا. يرجى الانتظار حتى تكتمل أو إلغاؤها.');
      err.status = 429;
      err.reason = 'concurrency_limit_reached';
      throw err;
    }

    const id = `job-${crypto.randomBytes(6).toString('hex')}`;
    const job = {
      id,
      type: meta?.type || 'figma-sync',
      target: meta?.target || '',
      nodeId: meta?.nodeId || null,
      status: 'running',
      cancelled: false,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
      resultSummary: null,
      onCancel,
    };

    this.jobs.set(id, job);
    this.pruneOldJobs();
    this.activeCount += 1;

    let timer = null;
    try {
      const timeoutPromise = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const timeoutErr = new Error('انتهت مهلة المهمة المحددة.');
          timeoutErr.status = 504;
          timeoutErr.reason = 'job_timeout';
          reject(timeoutErr);
        }, timeoutMs);
      });

      const result = await Promise.race([taskFn(job), timeoutPromise]);
      if (job.cancelled) {
        const cancelErr = new Error('تم إلغاء عملية المزامنة بناءً على طلب المستخدم.');
        cancelErr.status = 499;
        cancelErr.reason = 'cancelled';
        throw cancelErr;
      }

      job.status = 'completed';
      job.finishedAt = new Date().toISOString();
      job.resultSummary = {
        adapter: result?.adapter || 'figma-reader',
        selectedNodeId: result?.selectedNodeId || result?.ref?.nodeId || null,
      };
      return { job: this.serializeJob(job), result };
    } catch (err) {
      if (job.status !== 'cancelled') {
        job.status = 'failed';
      }
      job.finishedAt = new Date().toISOString();
      job.error = err.message;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
  }
}


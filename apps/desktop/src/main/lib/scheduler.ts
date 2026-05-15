import { app } from "electron";
import log from "electron-log/main.js";

interface Job {
  name: string;
  every: number;
  initialDelay: number;
  fn: () => Promise<void> | void;
  timer?: NodeJS.Timeout;
  initial?: NodeJS.Timeout;
}

const jobs = new Map<string, Job>();
let shutdownBound = false;

export interface ScheduleOpts {
  name: string;
  every: number;
  initialDelay?: number;
  fn: () => Promise<void> | void;
}

export function schedule(opts: ScheduleOpts): void {
  if (jobs.has(opts.name)) {
    log.warn(`[pond scheduler] duplicate job '${opts.name}', replacing`);
    cancel(opts.name);
  }
  const job: Job = {
    name: opts.name,
    every: opts.every,
    initialDelay: opts.initialDelay ?? opts.every,
    fn: opts.fn,
  };
  jobs.set(job.name, job);

  job.initial = setTimeout(() => {
    void run(job);
    job.timer = setInterval(() => void run(job), job.every);
  }, job.initialDelay);

  if (!shutdownBound) {
    shutdownBound = true;
    app.on("before-quit", stopAll);
  }
}

export function cancel(name: string): void {
  const job = jobs.get(name);
  if (!job) return;
  if (job.initial) clearTimeout(job.initial);
  if (job.timer) clearInterval(job.timer);
  jobs.delete(name);
}

export function stopAll(): void {
  for (const job of jobs.values()) {
    if (job.initial) clearTimeout(job.initial);
    if (job.timer) clearInterval(job.timer);
  }
  jobs.clear();
}

async function run(job: Job): Promise<void> {
  try {
    await job.fn();
  } catch (err) {
    log.warn(`[pond scheduler] '${job.name}' tick failed`, err);
  }
}

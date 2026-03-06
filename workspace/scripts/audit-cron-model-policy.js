#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const JOBS_PATH = process.argv[2] || path.join(__dirname, '../../cron/jobs.json');
const ALLOWED_BOOM = new Set([
  'b76c9b20-d206-4d2d-9d26-815804cd22fd',
  'd9d8123d-e14e-408d-b72c-04b273530943',
  'f6f0ba02-eab9-4ab1-87cb-c1a9e648b5aa',
  'merged-capability-pdca-4h'
]);
const ALLOWED_BOOM_MODEL = 'boom-cron-worker/gpt-5.3-codex';
const DEFAULT_MODEL = 'zhipu-cron/glm-5';

function fail(message, details = []) {
  const payload = { ok: false, message, details };
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
}

function main() {
  const raw = fs.readFileSync(JOBS_PATH, 'utf8');
  const data = JSON.parse(raw);
  const jobs = Array.isArray(data.jobs) ? data.jobs : [];
  const errors = [];

  for (const job of jobs) {
    const model = job?.payload?.model;
    const jobRef = `${job.id} (${job.name || 'unnamed'})`;
    const isAllowedBoomJob = ALLOWED_BOOM.has(job.id);

    if (isAllowedBoomJob) {
      if (model !== ALLOWED_BOOM_MODEL) {
        errors.push(`${jobRef}: must hardcode ${ALLOWED_BOOM_MODEL}, got ${model || '<unset>'}`);
      }
      continue;
    }

    if (model !== undefined) {
      errors.push(`${jobRef}: payload.model must be unset for non-exception jobs; found ${model}. Runtime default should fall back to ${DEFAULT_MODEL}`);
    }
  }

  if (errors.length > 0) {
    fail('cron model policy violation', errors);
  }

  console.log(JSON.stringify({
    ok: true,
    jobsChecked: jobs.length,
    allowedBoomJobs: Array.from(ALLOWED_BOOM),
    allowedBoomModel: ALLOWED_BOOM_MODEL,
    defaultModel: DEFAULT_MODEL,
    jobsPath: JOBS_PATH
  }, null, 2));
}

main();

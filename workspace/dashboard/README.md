# Dashboard — Agent Task Queue Renderer

Visual dashboard for OpenClaw agent task queue status. Produces a clean screenshot-ready HTML report.

## Layout

```
┌─────────────────────────────────────────────────────┐
│  ⬡ OpenClaw Agent Dashboard          ● Live View    │
├─────────────────────────────────────────────────────┤
│  AGENTS ONLINE                                      │
│  ┌─ Main Agent ─┐  ┌─ Coder Agent ─┐              │
│  │ model / task  │  │ model / task   │              │
│  └───────────────┘  └────────────────┘              │
├─────────────────────────────────────────────────────┤
│  TASK QUEUE (newest-first)  [Show N hidden done]    │
│  ─ Running tasks first                              │
│  ─ Done tasks visible for 10 minutes                │
│  ─ Done >10min hidden (toggle to show)              │
├─────────────────────────────────────────────────────┤
│  SUMMARY                                            │
│  ┌───────┐ ┌───────┐ ┌───────────┐ ┌───────┐      │
│  │Running│ │ Done  │ │Abnormal/Err│ │ Total │      │
│  └───────┘ └───────┘ └───────────┘ └───────┘      │
└─────────────────────────────────────────────────────┘
```

## Files

| File | Purpose |
|---|---|
| `render-dashboard.html` | HTML/CSS/JS template (loads `task-state.json` or inline data) |
| `build-dashboard.js` | Scans `reports/`, builds self-contained `snapshot.html` |
| `screenshot-dashboard.js` | Puppeteer-based `snapshot.html` → `screenshot.png` |
| `task-state.json` | Current task queue state (auto-generated or manually maintained) |
| `snapshot.html` | Self-contained snapshot (generated) |
| `screenshot.png` | PNG screenshot (generated) |

## Quick Start

```bash
# Scan reports, build snapshot, take screenshot
node dashboard/build-dashboard.js --scan --live
node dashboard/screenshot-dashboard.js

# Just rebuild from existing state
node dashboard/build-dashboard.js --live
node dashboard/screenshot-dashboard.js
```

## Flags

### build-dashboard.js
- `--scan` — Scan `reports/` for task metadata (default if `task-state.json` missing)
- `--live` — Set `generatedAt` to current time
- `--state <file>` — Use custom state file instead of `task-state.json`

### screenshot-dashboard.js
- `--width <px>` — Viewport width (default: 1200)
- `--height <px>` — Viewport height (default: 900)
- `--output <path>` — Custom output path

## Task State Schema

```json
{
  "generatedAt": "ISO8601",
  "agents": [
    {
      "id": "main",
      "label": "Main Agent",
      "model": "boom-coder/gpt-5.4",
      "status": "active|idle",
      "currentTask": "string or null"
    }
  ],
  "tasks": [
    {
      "id": "unique-id",
      "title": "Task Title",
      "agent": "coder",
      "status": "running|done|error|abnormal|queued",
      "startedAt": "ISO8601",
      "updatedAt": "ISO8601",
      "completedAt": "ISO8601 or null",
      "reportFile": "reports/xxx.md",
      "tags": ["tag1", "tag2"]
    }
  ]
}
```

## Integration

The dashboard can be updated by any agent:

```javascript
const { scanReports, inferAgents, buildSnapshot } = require('./dashboard/build-dashboard');
const tasks = scanReports();
const agents = inferAgents(tasks);
// ... or manually push tasks into task-state.json
```

For real-time views, serve `render-dashboard.html` with a web server; it fetches `task-state.json` dynamically.

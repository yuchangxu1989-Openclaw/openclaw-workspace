# Architecture Changelog

Auto-generated from git commits tagged with [ARCH] [FIX] [CONFIG] [BREAKING] [SECURITY] [REFACTOR].
This file is maintained by the post-commit hook.

---


## %Y->- (HEAD -> main) 7b61e0c40ebde62d4793ec597f2f8dc20f653942:%M:HEAD %z [CONFIG] Add git auto-memory mechanism: post-commit hook + cron backup script
- **Commit:** `7b61e0c` (7b61e0c40ebde62d4793ec597f2f8dc20f653942)
- **Author:** 战略家
- **变更统计:** 1 files, +107, -0
- **关键文件:**
  - scripts/sync-architecture-changelog.sh
- **详细说明:**
  > - post-commit hook auto-captures tagged commits to architecture-changelog.md
  > - Cron backup script syncs missed commits from last 7 days
  > - Supported tags: [ARCH] [FIX] [CONFIG] [BREAKING] [SECURITY] [REFACTOR]

---
## [2026-03-04T06:54:36.661Z] system.architecture.changed
事件总线记忆归档路由上线测试

- 来源: memory-archiver-test
- 影响: infrastructure/event-bus
- 详情: 添加 memory-archiver handler，支持 system.architecture.changed / system.config.changed / system.critical.fix 事件自动归档到 architecture-changelog.md

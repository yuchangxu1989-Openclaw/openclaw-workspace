# evomap-uploader

> 自动生成的技能文档骨架，请补充具体内容。

## 概述

TODO: 描述 evomap-uploader 的功能和用途。

## 使用方法

```javascript
const skill = require('./evomap-uploader');
// TODO: 使用示例
```

## 输入

| 参数 | 类型 | 说明 |
|------|------|------|
| TODO | TODO | TODO |

## 输出

TODO: 描述输出格式。

## 依赖

已有文件: capsule-aeo-1772727024922.json, capsule-aeo-1772842215992.json, capsule-aeo-1772914221974.json, capsule-aeo-1772986206240.json, capsule-aeo-1773015006655.json, capsule-aeo-1773033613014.json, capsule-aeo-1773072610430.json, capsule-aeo-1773252006642.json, capsule-cras-1772727035885.json, capsule-cras-1772741436501.json, capsule-cras-1772784649044.json, capsule-cras-1772799039581.json, capsule-cras-1772813456941.json, capsule-cras-1772827811838.json, capsule-cras-1772842218296.json, capsule-cras-1772856619630.json, capsule-cras-1772871050895.json, capsule-cras-1772885420645.json, capsule-cras-1772899831568.json, capsule-cras-1772928621866.json, capsule-cras-1772943025925.json, capsule-cras-1772971828446.json, capsule-cras-1773072610551.json, capsule-cras-1773241207050.json, capsule-cras-1773252006720.json, capsule-evomap-a2a-1772727055422.json, capsule-evomap-a2a-1772741455256.json, capsule-evomap-a2a-1772799055786.json, capsule-evomap-a2a-1773029407907.json, capsule-evomap-publisher-1772727057777.json, capsule-evomap-publisher-1772741457610.json, capsule-evomap-publisher-1772799057592.json, capsule-evomap-publisher-1772971828722.json, capsule-evomap-publisher-1773000606586.json, capsule-isc-capability-anchor-sync-1772727070154.json, capsule-isc-capability-anchor-sync-1772741469443.json, capsule-isc-capability-anchor-sync-1772799085440.json, capsule-isc-capability-anchor-sync-1773000606817.json, capsule-isc-capability-anchor-sync-1773029408649.json, capsule-isc-core-1772727072587.json, capsule-isc-core-1772741471707.json, capsule-isc-core-1772799087282.json, capsule-isc-core-1772813467152.json, capsule-isc-core-1772827814514.json, capsule-isc-core-1772842220643.json, capsule-isc-core-1772856628875.json, capsule-isc-core-1772871051660.json, capsule-isc-core-1772885422858.json, capsule-isc-core-1772899833186.json, capsule-isc-core-1772943028360.json, capsule-isc-core-1772957420511.json, capsule-isc-core-1772971829273.json, capsule-isc-core-1772986206479.json, capsule-isc-core-1773000606993.json, capsule-isc-core-1773029408827.json, capsule-isc-core-1773058207831.json, capsule-isc-core-1773072610880.json, capsule-isc-core-1773241207354.json, capsule-isc-core-1773252007048.json, capsule-isc-document-quality-1772727075002.json, capsule-isc-document-quality-1772741474052.json, capsule-isc-document-quality-1772799089118.json, capsule-isc-document-quality-1772885423622.json, capsule-isc-document-quality-1773029409004.json, capsule-lep-executor-1772727077455.json, capsule-lep-executor-1772741476413.json, capsule-lep-executor-1772799092796.json, capsule-lep-executor-1772856631176.json, capsule-lto-core-1772727048149.json, capsule-lto-core-1772741448167.json, capsule-lto-core-1772799050357.json, capsule-lto-core-1772856621906.json, capsule-lto-core-1772885421414.json, capsule-lto-core-1772971829837.json, capsule-lto-core-1773029409620.json, capsule-parallel-subagent-1772799098637.json, capsule-parallel-subagent-1773029409683.json, capsule-skill-creator-1773241207998.json, capsule-skill-creator-1773252007536.json, evals, gene-aeo-1772727024922.json, gene-aeo-1772842215992.json, gene-aeo-1772914221974.json, gene-aeo-1772986206240.json, gene-aeo-1773015006655.json, gene-aeo-1773033613014.json, gene-aeo-1773072610430.json, gene-aeo-1773252006642.json, gene-cras-1772727035885.json, gene-cras-1772741436501.json, gene-cras-1772784649044.json, gene-cras-1772799039581.json, gene-cras-1772813456941.json, gene-cras-1772827811838.json, gene-cras-1772842218296.json, gene-cras-1772856619630.json, gene-cras-1772871050895.json, gene-cras-1772885420645.json, gene-cras-1772899831568.json, gene-cras-1772928621866.json, gene-cras-1772943025925.json, gene-cras-1772971828446.json, gene-cras-1773072610551.json, gene-cras-1773241207050.json, gene-cras-1773252006720.json, gene-evomap-a2a-1772727055422.json, gene-evomap-a2a-1772741455256.json, gene-evomap-a2a-1772799055786.json, gene-evomap-a2a-1773029407907.json, gene-evomap-publisher-1772727057777.json, gene-evomap-publisher-1772741457610.json, gene-evomap-publisher-1772799057592.json, gene-evomap-publisher-1772971828722.json, gene-evomap-publisher-1773000606586.json, gene-isc-capability-anchor-sync-1772727070154.json, gene-isc-capability-anchor-sync-1772741469443.json, gene-isc-capability-anchor-sync-1772799085440.json, gene-isc-capability-anchor-sync-1773000606817.json, gene-isc-capability-anchor-sync-1773029408649.json, gene-isc-core-1772727072587.json, gene-isc-core-1772741471707.json, gene-isc-core-1772799087282.json, gene-isc-core-1772813467152.json, gene-isc-core-1772827814514.json, gene-isc-core-1772842220643.json, gene-isc-core-1772856628875.json, gene-isc-core-1772871051660.json, gene-isc-core-1772885422858.json, gene-isc-core-1772899833186.json, gene-isc-core-1772943028360.json, gene-isc-core-1772957420511.json, gene-isc-core-1772971829273.json, gene-isc-core-1772986206479.json, gene-isc-core-1773000606993.json, gene-isc-core-1773029408827.json, gene-isc-core-1773058207831.json, gene-isc-core-1773072610880.json, gene-isc-core-1773241207354.json, gene-isc-core-1773252007048.json, gene-isc-document-quality-1772727075002.json, gene-isc-document-quality-1772741474052.json, gene-isc-document-quality-1772799089118.json, gene-isc-document-quality-1772885423622.json, gene-isc-document-quality-1773029409004.json, gene-lep-executor-1772727077455.json, gene-lep-executor-1772741476413.json, gene-lep-executor-1772799092796.json, gene-lep-executor-1772856631176.json, gene-lto-core-1772727048149.json, gene-lto-core-1772741448167.json, gene-lto-core-1772799050357.json, gene-lto-core-1772856621906.json, gene-lto-core-1772885421414.json, gene-lto-core-1772971829837.json, gene-lto-core-1773029409620.json, gene-parallel-subagent-1772799098637.json, gene-parallel-subagent-1773029409683.json, gene-skill-creator-1773241207998.json, gene-skill-creator-1773252007536.json

---
*自动生成于 2026-03-12T02:25:03.265Z*

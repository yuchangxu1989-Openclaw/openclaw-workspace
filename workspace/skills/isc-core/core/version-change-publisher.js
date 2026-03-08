#!/usr/bin/env node
/**
 * 版本变更自动发布引擎
 * 监听 本地任务编排/ISC 版本变更，自动发布到 GitHub 和 EvoMap
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { SKILLS_DIR, WORKSPACE } = require('../../shared/paths');
const { EvoMapUploader } = require('../../evomap-uploader/lib/uploader');

class VersionChangePublisher {
    constructor() {
        this.watchList = [
            { name: 'lto-core', path: path.join(SKILLS_DIR, 'lto-core') },
            { name: 'isc-core', path: path.join(SKILLS_DIR, 'isc-core') }
        ];
        this.versionCache = this.loadVersionCache();
        this.uploader = new EvoMapUploader();
    }

    loadVersionCache() {
        const cachePath = path.join(WORKSPACE, '.version-publish-cache.json');
        if (fs.existsSync(cachePath)) {
            return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        }
        return {};
    }

    saveVersionCache() {
        const cachePath = path.join(WORKSPACE, '.version-publish-cache.json');
        fs.writeFileSync(cachePath, JSON.stringify(this.versionCache, null, 2));
    }

    /**
     * 获取技能当前版本
     */
    getCurrentVersion(skillPath) {
        try {
            const packageJson = path.join(skillPath, 'package.json');
            const skillMd = path.join(skillPath, 'SKILL.md');
            
            if (fs.existsSync(packageJson)) {
                const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8'));
                return pkg.version;
            }
            
            if (fs.existsSync(skillMd)) {
                const content = fs.readFileSync(skillMd, 'utf8');
                const match = content.match(/version[:\s]+["']?([\d.]+)["']?/i);
                if (match) return match[1];
            }
        } catch (e) {
            console.error(`[VersionPublisher] 读取版本失败: ${skillPath}`);
        }
        return null;
    }

    /**
     * 检查版本变更
     */
    checkVersionChanges() {
        const changes = [];
        
        for (const skill of this.watchList) {
            const currentVersion = this.getCurrentVersion(skill.path);
            const cachedVersion = this.versionCache[skill.name];
            
            if (currentVersion && currentVersion !== cachedVersion) {
                console.log(`[VersionPublisher] 版本变更: ${skill.name} ${cachedVersion} → ${currentVersion}`);
                changes.push({
                    name: skill.name,
                    oldVersion: cachedVersion,
                    newVersion: currentVersion,
                    path: skill.path
                });
            }
        }
        
        return changes;
    }

    /**
     * 发布到 GitHub
     */
    async publishToGitHub(skill) {
        console.log(`[VersionPublisher] 发布 ${skill.name} 到 GitHub...`);
        
        try {
            // 创建版本标签分支
            const tagName = `${skill.name}-v${skill.newVersion}`;
            const backupBranch = `release-${skill.name}-${skill.newVersion}`;
            
            execSync(`cd ${WORKSPACE} && git checkout -b ${backupBranch}`, { stdio: 'pipe' });
            execSync(`cd ${WORKSPACE} && git add ${skill.path}`, { stdio: 'pipe' });
            execSync(`cd ${WORKSPACE} && git commit -m "Release ${skill.name} v${skill.newVersion}"`, { stdio: 'pipe' });
            execSync(`cd ${WORKSPACE} && git push origin ${backupBranch} --force-with-lease`, { stdio: 'pipe' });
            
            console.log(`  ✅ GitHub: ${backupBranch}`);
            return { success: true, branch: backupBranch };
        } catch (e) {
            console.error(`  ❌ GitHub 失败:`, e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 发布到 EvoMap
     */
    async publishToEvoMap(skill) {
        console.log(`[VersionPublisher] 发布 ${skill.name} 到 EvoMap...`);
        
        try {
            const result = await this.uploader.uploadSkill({
                name: skill.name,
                version: skill.newVersion,
                category: 'optimize',
                signals: ['version_update', 'improvement'],
                summary: `${skill.name} v${skill.newVersion} - Version update with improvements`
            });
            
            if (result.success) {
                console.log(`  ✅ EvoMap: ${result.bundleId}`);
            } else {
                console.error(`  ❌ EvoMap 失败:`, result.error);
            }
            
            return result;
        } catch (e) {
            console.error(`  ❌ EvoMap 失败:`, e.message);
            return { success: false, error: e.message };
        }
    }

    /**
     * 执行发布
     */
    async publish(changes) {
        for (const skill of changes) {
            console.log(`\n[VersionPublisher] 处理 ${skill.name}...`);
            
            // 1. 发布到 GitHub
            const githubResult = await this.publishToGitHub(skill);
            
            // 2. 发布到 EvoMap
            const evoMapResult = await this.publishToEvoMap(skill);
            
            // 3. 更新缓存
            if (githubResult.success || evoMapResult.success) {
                this.versionCache[skill.name] = skill.newVersion;
                this.saveVersionCache();
            }
        }
    }

    /**
     * 主循环
     */
    async run() {
        console.log('[VersionPublisher] 检查版本变更...');
        
        const changes = this.checkVersionChanges();
        
        if (changes.length === 0) {
            console.log('  无版本变更');
            return;
        }
        
        console.log(`  发现 ${changes.length} 个版本变更`);
        await this.publish(changes);
        
        console.log('[VersionPublisher] 完成');
    }
}

// CLI
if (require.main === module) {
    const publisher = new VersionChangePublisher();
    publisher.run().catch(e => {
        console.error('错误:', e);
        process.exit(1);
    });
}

module.exports = { VersionChangePublisher };

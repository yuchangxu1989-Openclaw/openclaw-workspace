"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SkillInstaller = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class SkillInstaller {
    store;
    ctx;
    workspaceSkillsDir;
    constructor(store, ctx) {
        this.store = store;
        this.ctx = ctx;
        this.workspaceSkillsDir = path.join(ctx.workspaceDir, "skills");
    }
    install(skillId) {
        const skill = this.store.getSkill(skillId);
        if (!skill)
            return { installed: false, path: "", message: "Skill not found" };
        if (!fs.existsSync(skill.dirPath)) {
            return { installed: false, path: "", message: `Skill directory not found: ${skill.dirPath}` };
        }
        const dstDir = path.join(this.workspaceSkillsDir, skill.name);
        fs.mkdirSync(dstDir, { recursive: true });
        fs.cpSync(skill.dirPath, dstDir, { recursive: true });
        this.store.updateSkill(skillId, { installed: 1 });
        this.ctx.log.info(`Skill installed: "${skill.name}" v${skill.version} → ${dstDir}`);
        return {
            installed: true,
            path: dstDir,
            message: `Skill "${skill.name}" v${skill.version} installed`,
        };
    }
    uninstall(skillId) {
        const skill = this.store.getSkill(skillId);
        if (!skill)
            return;
        const dstDir = path.join(this.workspaceSkillsDir, skill.name);
        if (fs.existsSync(dstDir)) {
            fs.rmSync(dstDir, { recursive: true });
        }
        this.store.updateSkill(skillId, { installed: 0 });
        this.ctx.log.info(`Skill uninstalled: "${skill.name}"`);
    }
    syncIfInstalled(skillName) {
        const skill = this.store.getSkillByName(skillName);
        if (!skill || !skill.installed)
            return;
        const dstDir = path.join(this.workspaceSkillsDir, skill.name);
        if (fs.existsSync(dstDir) && fs.existsSync(skill.dirPath)) {
            fs.cpSync(skill.dirPath, dstDir, { recursive: true });
            this.ctx.log.info(`Skill synced: "${skill.name}" v${skill.version} → workspace`);
        }
    }
}
exports.SkillInstaller = SkillInstaller;
//# sourceMappingURL=installer.js.map
## 🔒 子Agent工作规范（必读）

### 工作目录
主项目根目录：`/root/.openclaw/workspace`
所有文件操作必须基于此路径。你的默认cwd可能不是这个目录，执行命令前必须先：
```bash
cd /root/.openclaw/workspace
```

### 时区
所有日期/时间使用 Asia/Shanghai (GMT+8)。
JS代码中用：
```javascript
const now = new Date(new Date().toLocaleString('en-US', {timeZone: 'Asia/Shanghai'}));
```

### 铁令（违反=任务失败）
1. 禁止执行 `openclaw doctor --fix`
2. 禁止修改 openclaw.json
3. 禁止删除 shared/paths.js、evomap数据文件、public/子目录
4. 改完代码必须 git commit + git push
5. 找不到文件先 `ls` 确认路径，不要猜

### 提交规范
```bash
cd /root/.openclaw/workspace
git add <具体文件>
git commit -m "<type>(<scope>): <description>"
git push
```

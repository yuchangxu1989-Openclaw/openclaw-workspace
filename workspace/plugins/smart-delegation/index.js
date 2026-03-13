const http = require('http');

const plugin = {
  id: "smart-delegation",
  name: "Smart Delegation",
  description: "注册delegate_to_agent工具，让主Agent通过正常tool call委派任务给子Agent",
  register(api) {
    api.registerTool({
      name: "delegate_to_agent",
      description: "将任务委派给子Agent执行。代码修改、复杂分析、文件操作等必须用此工具委派，不要自己exec执行。",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string", description: "任务描述" },
          agentId: { type: "string", description: "目标Agent ID（coder/analyst/scout/reviewer/writer及其-02后缀）" },
          label: { type: "string", description: "任务标签（可选）" },
          thinking: { type: "string", description: "thinking级别：off/low/medium/high（可选，默认off）" }
        },
        required: ["task", "agentId"]
      },
      handler: async (params, ctx) => {
        const { task, agentId, label, thinking } = params;

        // 方式1：尝试runtime API
        if (ctx?.runtime?.system?.spawnSubagent) {
          try {
            const result = await ctx.runtime.system.spawnSubagent({
              task,
              agentId,
              label: label || undefined,
              thinking: thinking || "off",
              mode: "run",
              runtime: "subagent",
              cleanup: "keep",
              sandbox: "inherit"
            });
            return {
              status: "accepted",
              agentId,
              runId: result.runId || "unknown",
              note: "auto-announces on completion"
            };
          } catch (e) {
            api.logger.warn("smart-delegation: runtime spawn failed, trying gateway: " + e.message);
          }
        }

        // 方式2：通过gateway HTTP API
        try {
          const gatewayPort = 7681;
          const body = JSON.stringify({
            task,
            agentId,
            label: label || undefined,
            thinking: thinking || "off",
            mode: "run",
            runtime: "subagent"
          });

          const result = await new Promise((resolve, reject) => {
            const req = http.request({
              hostname: "127.0.0.1",
              port: gatewayPort,
              path: "/api/sessions/spawn",
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
              },
              timeout: 10000
            }, (res) => {
              let data = "";
              res.on("data", (chunk) => data += chunk);
              res.on("end", () => {
                try { resolve(JSON.parse(data)); }
                catch { resolve({ status: "ok", raw: data }); }
              });
            });
            req.on("error", reject);
            req.on("timeout", () => { req.destroy(); reject(new Error("gateway timeout")); });
            req.write(body);
            req.end();
          });

          return {
            status: result.status || "accepted",
            agentId,
            runId: result.runId || "unknown",
            note: "auto-announces on completion"
          };
        } catch (e) {
          api.logger.warn("smart-delegation: gateway spawn also failed: " + e.message);
          return {
            status: "error",
            message: "无法派发任务，runtime和gateway均不可用: " + e.message
          };
        }
      }
    });
  }
};
module.exports = plugin;

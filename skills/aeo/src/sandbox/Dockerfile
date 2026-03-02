# AEO Sandbox - 评测沙盒镜像
# 用于安全隔离执行技能评测任务

FROM node:20-alpine

# 安全：以非root用户运行
RUN addgroup -g 1001 aeo && \
    adduser -u 1001 -G aeo -s /bin/sh -D aeo

# 安装基础工具
RUN apk add --no-cache \
    curl \
    ca-certificates \
    tzdata \
    && rm -rf /var/cache/apk/*

# 设置时区
ENV TZ=Asia/Shanghai

# 创建工作目录
WORKDIR /workspace

# 创建输入/输出目录
RUN mkdir -p /input /output /workspace/node_modules && \
    chown -R aeo:aeo /workspace /input /output

# 安装常用评测依赖（预装加速）
COPY --chown=aeo:aeo package.json /workspace/
RUN npm install --production && npm cache clean --force

# 安全加固：限制权限
RUN chmod 755 /workspace && \
    chmod 555 /input && \
    chmod 755 /output

# 复制沙盒运行时代码
COPY --chown=aeo:aeo sandbox-runtime.js /workspace/

# 切换到非root用户
USER aeo

# 健康检查
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "console.log('healthy')" || exit 1

# 默认命令：保持运行
CMD ["tail", "-f", "/dev/null"]

/**
 * 报告格式化器 - 飞书卡片标准格式
 * 根据飞书API文档和图片示例实现
 */

class ReportFormatter {
  constructor() {
    this.templates = new Map();
    this.loadTemplates();
  }

  loadTemplates() {
    this.templates.set('cras_b_insight', this.crasBTemplate.bind(this));
    this.templates.set('cras_a_learning', this.crasATemplate.bind(this));
    this.templates.set('cras_c_governance', this.crasCGovernanceTemplate.bind(this));
    this.templates.set('cras_d_research', this.crasDResearchTemplate.bind(this));
    this.templates.set('cras_e_evolution', this.crasEEvolutionTemplate.bind(this));
    this.templates.set('evolver', this.evolverTemplate.bind(this));
    this.templates.set('cars_dashboard', this.carsDashboardTemplate.bind(this));
    this.templates.set('cron_failure', this.cronFailureTemplate.bind(this));
    this.templates.set('default', this.defaultTemplate.bind(this));
  }

  format(taskName, data, templateName = 'default') {
    const template = this.templates.get(templateName) || this.templates.get('default');
    return template(taskName, data);
  }

  /**
   * CRAS-B 用户洞察分析
   * 标题格式：CRAS-B用户洞察分析 [时间]
   */
  crasBTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: `CRAS-B用户洞察分析 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**主要意图**：${data.intent || '-'}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**情绪状态**：${data.emotion || '-'}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**交互模式**：${data.pattern || '-'}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**累计提炼**：${data.totalExtractions || 0}次`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**洞察摘要**\n\n${data.summary || '无'}`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**待办事项**：${data.todos || '无'}`
          }
        }
      ]
    };
  }

  /**
   * CRAS-A 主动学习引擎
   */
  crasATemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "green",
        title: {
          tag: "plain_text",
          content: `CRAS-A主动学习引擎 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**论文采集**：${data.papers || 0}篇`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**关键洞察**：${data.insights || 0}条`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**优化建议**\n\n${data.recommendations || '无'}`
          }
        }
      ]
    };
  }

  /**
   * CRAS-C 知识治理
   */
  crasCGovernanceTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: `CRAS-C知识治理 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**文档向量化**：${data.vectorized || 0}个`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**智能分类**：${data.classified || 0}个`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**重复项**：${data.duplicates || 0}个待处理`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**质量评估**：${data.quality || '完成'}`
          }
        }
      ]
    };
  }

  /**
   * CRAS-D 战略调研
   */
  crasDResearchTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "purple",
        title: {
          tag: "plain_text",
          content: `CRAS-D战略调研 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**行业趋势**：${data.trends || 0}条`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**关键洞察**：${data.insights || 0}条`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**战略启示**\n\n${data.implications || '无'}`
          }
        }
      ]
    };
  }

  /**
   * CRAS-E 自主进化
   */
  crasEEvolutionTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "orange",
        title: {
          tag: "plain_text",
          content: `CRAS-E自主进化 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**知识库扫描**：${data.scanned || 0}条`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**规律识别**：${data.patterns || 0}个`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**优化建议**：${data.suggestions || 0}条`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**执行结果**\n\n${data.result || '无'}`
          }
        }
      ]
    };
  }

  /**
   * EvoMap-Evolver 自动进化
   */
  evolverTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "purple",
        title: {
          tag: "plain_text",
          content: `EvoMap-Evolver自动进化 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**进化周期**：${data.cycles || 0}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**信号检测**：${data.signals || 0}个`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**执行结论**\n\n${data.conclusion || '无'}`
          }
        }
      ]
    };
  }

  /**
   * CARS-四维意图洞察仪表盘
   */
  carsDashboardTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: `CARS-四维意图洞察仪表盘 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**分析周期**：${data.period || '过去24小时'}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**活跃会话**：${data.sessions || 0}个`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**用户消息**：${data.messages || 0}条`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**核心发现**\n\n${data.findings || '无'}`
          }
        }
      ]
    };
  }

  /**
   * Cron 失败通知
   */
  cronFailureTemplate(taskName, data) {
    const time = data.time || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "red",
        title: {
          tag: "plain_text",
          content: `❌ 定时任务执行异常 [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**任务名称**：${data.taskName}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**异常类型**：${data.errorType}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**上次成功**：${data.lastSuccess || '未知'}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**连续失败**：${data.consecutiveErrors || 1}次`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**错误信息**\n\n\`\`\`\n${data.errorMessage}\n\`\`\``
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**建议操作**：${data.suggestedAction || '请检查系统日志并手动重试'}`
          }
        }
      ]
    };
  }

  /**
   * 默认模板
   */
  defaultTemplate(taskName, data) {
    const time = data.executionTime || new Date().toLocaleString('zh-CN');
    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: {
          tag: "plain_text",
          content: `${taskName} [${time}]`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**执行结果**：${data.status || '完成'}`
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: data.summary || '执行完成'
          }
        }
      ]
    };
  }
}

module.exports = ReportFormatter;

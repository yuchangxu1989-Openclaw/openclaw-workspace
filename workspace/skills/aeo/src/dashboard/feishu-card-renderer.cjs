/**
 * AEO Phase 3 - 飞书卡片报告生成器
 * 生成漂亮的评测报告卡片，支持多种模板
 */

class FeishuCardRenderer {
  constructor(options = {}) {
    this.options = {
      title: options.title || 'AEO 智能体效果评测报告',
      subtitle: options.subtitle || 'Agent Effectiveness Operations',
      theme: options.theme || 'blue', // blue, green, orange, red
      showDetails: options.showDetails !== false,
      ...options
    };
  }

  /**
   * 生成完整评测报告卡片
   */
  generateReportCard(data) {
    const {
      skillName,
      skillType,
      track,
      overallScore,
      passed,
      dimensions,
      suggestions,
      timestamp,
      trend,
      duration
    } = data;

    const themeColor = this._getThemeColor(passed, overallScore);
    const scoreEmoji = this._getScoreEmoji(overallScore);
    const statusText = passed ? '✅ 评测通过' : '❌ 评测未通过';

    const card = {
      config: {
        wide_screen_mode: true
      },
      header: {
        template: themeColor,
        title: {
          tag: "plain_text",
          content: this.options.title
        },
        subtitle: {
          tag: "plain_text",
          content: `${skillName} · ${this._formatDate(timestamp)}`
        }
      },
      elements: [
        // 总体评分区
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `**${scoreEmoji} 总体评分: ${(overallScore * 100).toFixed(1)}%** ${statusText}`
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `技能类型: ${skillType} | 评测轨道: ${track} | 耗时: ${duration}ms`
          }
        },
        // 分割线
        { tag: "hr" },
        // 各维度评分
        ...this._generateDimensionsSection(dimensions),
        // 分割线
        { tag: "hr" },
        // 改进建议
        ...this._generateSuggestionsSection(suggestions),
        // 趋势信息
        ...(trend ? this._generateTrendSection(trend) : []),
        // 底部操作
        {
          tag: "action",
          actions: [
            {
              tag: "button",
              text: {
                tag: "plain_text",
                content: "查看详情"
              },
              type: "primary",
              value: {
                action: "view_details",
                skill: skillName
              }
            },
            {
              tag: "button",
              text: {
                tag: "plain_text",
                content: "重新评测"
              },
              type: "default",
              value: {
                action: "re_evaluate",
                skill: skillName
              }
            }
          ]
        }
      ]
    };

    return card;
  }

  /**
   * 生成简洁版卡片（用于通知）
   */
  generateCompactCard(data) {
    const { skillName, overallScore, passed, timestamp } = data;
    const themeColor = this._getThemeColor(passed, overallScore);
    const scoreEmoji = this._getScoreEmoji(overallScore);

    return {
      config: { wide_screen_mode: false },
      header: {
        template: themeColor,
        title: {
          tag: "plain_text",
          content: `AEO评测 · ${skillName}`
        }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `${scoreEmoji} **${(overallScore * 100).toFixed(0)}%** ${passed ? '通过' : '未通过'}`
          }
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: this._formatDate(timestamp)
            }
          ]
        }
      ]
    };
  }

  /**
   * 生成对比报告卡片
   */
  generateComparisonCard(data) {
    const { skills, title = 'AEO 技能对比报告' } = data;
    
    const rows = skills.map(s => {
      const emoji = this._getScoreEmoji(s.score);
      return `| ${s.name} | ${emoji} ${(s.score * 100).toFixed(0)}% | ${s.track} | ${s.passed ? '✅' : '❌'} |`;
    }).join('\n');

    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: { tag: "plain_text", content: title }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: `| 技能名称 | 评分 | 轨道 | 状态 |\n|---|---|---|---|\n${rows}`
          }
        },
        {
          tag: "note",
          elements: [
            {
              tag: "plain_text",
              content: `共 ${skills.length} 个技能参与对比`
            }
          ]
        }
      ]
    };
  }

  /**
   * 生成趋势报告卡片
   */
  generateTrendCard(data) {
    const { skillName, trendData, period = '7天' } = data;
    
    // 生成趋势描述
    const trendText = this._generateTrendText(trendData);
    
    // 生成柱状图（使用emoji）
    const chartText = this._generateBarChart(trendData);

    return {
      config: { wide_screen_mode: true },
      header: {
        template: "blue",
        title: { tag: "plain_text", content: `${skillName} - 效果趋势` },
        subtitle: { tag: "plain_text", content: `最近${period}` }
      },
      elements: [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: trendText
          }
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: chartText
          }
        },
        {
          tag: "hr"
        },
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: this._generateTrendStats(trendData)
          }
        }
      ]
    };
  }

  /**
   * 渲染为JSON字符串（用于发送）
   */
  render(card) {
    return JSON.stringify(card, null, 2);
  }

  // ============ 私有方法 ============

  _getThemeColor(passed, score) {
    if (!passed) return "red";
    if (score >= 0.9) return "green";
    if (score >= 0.7) return "blue";
    return "orange";
  }

  _getScoreEmoji(score) {
    if (score >= 0.9) return "🌟";
    if (score >= 0.8) return "👍";
    if (score >= 0.7) return "📊";
    if (score >= 0.6) return "⚠️";
    return "🔴";
  }

  _formatDate(timestamp) {
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  _generateDimensionsSection(dimensions) {
    if (!dimensions || dimensions.length === 0) {
      return [{
        tag: "div",
        text: { tag: "plain_text", content: "暂无维度评分数据" }
      }];
    }

    const elements = [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**📊 维度评分详情**"
        }
      }
    ];

    // 生成进度条
    dimensions.forEach(dim => {
      const progressBar = this._generateProgressBar(dim.score);
      const emoji = dim.score >= 0.8 ? "🟢" : dim.score >= 0.6 ? "🟡" : "🔴";
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `${emoji} **${dim.name}** (${(dim.weight * 100).toFixed(0)}%)\n${progressBar} ${(dim.score * 100).toFixed(1)}%`
        }
      });
    });

    return elements;
  }

  _generateProgressBar(score) {
    const filled = Math.round(score * 10);
    const empty = 10 - filled;
    return "█".repeat(filled) + "░".repeat(empty);
  }

  _generateSuggestionsSection(suggestions) {
    if (!suggestions || suggestions.length === 0) {
      return [
        {
          tag: "div",
          text: {
            tag: "lark_md",
            content: "**💡 改进建议**\n🎉 恭喜！暂无改进建议，表现优秀！"
          }
        }
      ];
    }

    const elements = [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: "**💡 改进建议**"
        }
      }
    ];

    suggestions.forEach((suggestion, index) => {
      const priorityEmoji = suggestion.priority === 'high' ? '🔴' : 
                           suggestion.priority === 'medium' ? '🟡' : '🔵';
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `${index + 1}. ${priorityEmoji} ${suggestion.text}`
        }
      });
    });

    return elements;
  }

  _generateTrendSection(trend) {
    const elements = [];
    
    if (trend.change !== undefined) {
      const changeEmoji = trend.change > 0 ? "📈" : trend.change < 0 ? "📉" : "➡️";
      const changeText = trend.change > 0 ? `+${(trend.change * 100).toFixed(1)}%` : 
                        `${(trend.change * 100).toFixed(1)}%`;
      
      elements.push({
        tag: "hr"
      });
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `**${changeEmoji} 趋势变化**: ${changeText} (${trend.period || '最近7天'})`
        }
      });
    }

    if (trend.ranking !== undefined) {
      elements.push({
        tag: "div",
        text: {
          tag: "lark_md",
          content: `🏆 **排名**: 第 ${trend.ranking} 位 (共 ${trend.total || '?'} 个技能)`
        }
      });
    }

    return elements;
  }

  _generateTrendText(trendData) {
    if (!trendData || trendData.length === 0) return "暂无趋势数据";
    
    const first = trendData[0].score;
    const last = trendData[trendData.length - 1].score;
    const change = last - first;
    const avg = trendData.reduce((sum, d) => sum + d.score, 0) / trendData.length;
    
    const trendEmoji = change > 0 ? "📈" : change < 0 ? "📉" : "➡️";
    const changeText = change > 0 ? `上升 +${(change * 100).toFixed(1)}%` : 
                      change < 0 ? `下降 ${(change * 100).toFixed(1)}%` : "持平";
    
    return `${trendEmoji} **趋势概览**: ${changeText} | 平均分: ${(avg * 100).toFixed(1)}%`;
  }

  _generateBarChart(trendData) {
    if (!trendData || trendData.length === 0) return "";
    
    const maxScore = Math.max(...trendData.map(d => d.score));
    const lines = trendData.map(d => {
      const barLength = Math.round((d.score / maxScore) * 20);
      const bar = "█".repeat(barLength);
      const date = new Date(d.date).getDate();
      return `${date.toString().padStart(2)}日 |${bar} ${(d.score * 100).toFixed(0)}%`;
    });
    
    return "```\n" + lines.join("\n") + "\n```";
  }

  _generateTrendStats(trendData) {
    if (!trendData || trendData.length === 0) return "";
    
    const scores = trendData.map(d => d.score);
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    
    return `**统计**: 最高 ${(max * 100).toFixed(0)}% | 最低 ${(min * 100).toFixed(0)}% | 平均 ${(avg * 100).toFixed(0)}%`;
  }
}

// ============ 快捷函数 ============

function createReportCard(data, options = {}) {
  const renderer = new FeishuCardRenderer(options);
  return renderer.generateReportCard(data);
}

function createCompactCard(data, options = {}) {
  const renderer = new FeishuCardRenderer(options);
  return renderer.generateCompactCard(data);
}

function createComparisonCard(data, options = {}) {
  const renderer = new FeishuCardRenderer(options);
  return renderer.generateComparisonCard(data);
}

function createTrendCard(data, options = {}) {
  const renderer = new FeishuCardRenderer(options);
  return renderer.generateTrendCard(data);
}

// ============ 导出 ============

module.exports = {
  FeishuCardRenderer,
  createReportCard,
  createCompactCard,
  createComparisonCard,
  createTrendCard
};

// CLI测试
if (require.main === module) {
  const renderer = new FeishuCardRenderer();
  
  // 生成示例报告
  const sampleData = {
    skillName: "智能客服助手",
    skillType: "llm",
    track: "AI效果",
    overallScore: 0.87,
    passed: true,
    duration: 2345,
    timestamp: Date.now(),
    dimensions: [
      { name: "相关性", score: 0.92, weight: 0.25 },
      { name: "连贯性", score: 0.88, weight: 0.20 },
      { name: "有用性", score: 0.85, weight: 0.25 },
      { name: "创造性", score: 0.82, weight: 0.15 },
      { name: "安全性", score: 0.90, weight: 0.15 }
    ],
    suggestions: [
      { text: "增加更多上下文理解能力", priority: "medium" },
      { text: "优化回答的简洁性", priority: "low" }
    ],
    trend: {
      change: 0.05,
      period: "最近7天",
      ranking: 3,
      total: 12
    }
  };

  const card = renderer.generateReportCard(sampleData);
  console.log("=== 飞书卡片报告 ===");
  console.log(renderer.render(card));
}

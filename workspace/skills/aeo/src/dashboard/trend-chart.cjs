/**
 * AEO Phase 3 - 效果趋势图模块
 * 历史数据可视化，支持多种图表类型
 */

const fs = require('fs');
const path = require('path');

class TrendChart {
  constructor(options = {}) {
    this.options = {
      width: options.width || 60,
      height: options.height || 15,
      style: options.style || 'ascii', // ascii, unicode, block
      showGrid: options.showGrid !== false,
      showLegend: options.showLegend !== false,
      colorEnabled: options.colorEnabled !== false,
      ...options
    };
    
    this.colors = {
      reset: '\x1b[0m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      red: '\x1b[31m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
      bold: '\x1b[1m'
    };
  }

  /**
   * 生成线性趋势图
   */
  generateLineChart(data, options = {}) {
    const {
      title = '效果趋势图',
      xLabel = '时间',
      yLabel = '评分',
      series = []
    } = options;

    if (!data || data.length === 0) {
      return this._colorize('暂无数据', 'gray');
    }

    const width = this.options.width;
    const height = this.options.height;
    
    // 计算数据范围
    const scores = data.map(d => d.score);
    const minScore = Math.min(...scores, 0);
    const maxScore = Math.max(...scores, 1);
    const range = maxScore - minScore || 1;
    
    // 创建画布
    const canvas = Array(height).fill(null).map(() => Array(width).fill(' '));
    
    // 绘制坐标轴
    this._drawAxes(canvas, width, height);
    
    // 绘制数据点连线
    this._drawLine(canvas, data, width, height, minScore, range);
    
    // 渲染为字符串
    let output = this._renderTitle(title);
    output += this._renderCanvas(canvas);
    output += this._renderLabels(data, width, minScore, maxScore);
    
    return output;
  }

  /**
   * 生成柱状趋势图
   */
  generateBarChart(data, options = {}) {
    const {
      title = '效果柱状图',
      barWidth = 3,
      filled = true
    } = options;

    if (!data || data.length === 0) {
      return this._colorize('暂无数据', 'gray');
    }

    const width = this.options.width;
    const height = this.options.height;
    
    // 计算数据范围
    const scores = data.map(d => d.score);
    const maxScore = Math.max(...scores, 1);
    
    // 计算每个柱子的位置和高度
    const barCount = data.length;
    const totalBarWidth = barCount * barWidth + (barCount - 1);
    const startX = Math.floor((width - totalBarWidth) / 2);
    
    // 创建画布
    const canvas = Array(height).fill(null).map(() => Array(width).fill(' '));
    
    // 绘制基线
    for (let x = 0; x < width; x++) {
      canvas[height - 1][x] = '─';
    }
    
    // 绘制柱状
    data.forEach((item, index) => {
      const barHeight = Math.round((item.score / maxScore) * (height - 2));
      const x = startX + index * (barWidth + 1);
      const color = this._getScoreColor(item.score);
      
      for (let h = 0; h < barHeight; h++) {
        const y = height - 2 - h;
        for (let w = 0; w < barWidth; w++) {
          if (x + w < width) {
            canvas[y][x + w] = filled ? '█' : (w === 0 || w === barWidth - 1 ? '│' : ' ');
          }
        }
      }
    });
    
    let output = this._renderTitle(title);
    output += this._renderCanvas(canvas);
    
    // 添加图例
    if (this.options.showLegend) {
      output += '\n' + data.map((d, i) => 
        `${i + 1}.${d.label || d.date}`
      ).join('  ') + '\n';
    }
    
    return output;
  }

  /**
   * 生成多系列对比图
   */
  generateMultiSeriesChart(datasets, options = {}) {
    const {
      title = '多系列对比图',
      labels = []
    } = options;

    if (!datasets || datasets.length === 0) {
      return this._colorize('暂无数据', 'gray');
    }

    const width = this.options.width;
    const height = this.options.height;
    const symbols = ['●', '■', '▲', '◆', '★'];
    const colors = ['green', 'blue', 'cyan', 'yellow', 'red'];
    
    // 计算统一的数据范围
    let allScores = [];
    datasets.forEach(ds => {
      allScores = allScores.concat(ds.data.map(d => d.score));
    });
    const minScore = Math.min(...allScores, 0);
    const maxScore = Math.max(...allScores, 1);
    const range = maxScore - minScore || 1;
    
    // 创建画布
    const canvas = Array(height).fill(null).map(() => Array(width).fill(' '));
    
    // 绘制坐标轴
    this._drawAxes(canvas, width, height);
    
    // 绘制每个系列
    datasets.forEach((series, seriesIndex) => {
      const symbol = symbols[seriesIndex % symbols.length];
      this._drawSeries(canvas, series.data, width, height, minScore, range, symbol);
    });
    
    let output = this._renderTitle(title);
    output += this._renderCanvas(canvas);
    
    // 添加图例
    if (this.options.showLegend) {
      output += '\n图例:\n';
      datasets.forEach((series, i) => {
        const symbol = symbols[i % symbols.length];
        const color = colors[i % colors.length];
        const avg = series.data.reduce((sum, d) => sum + d.score, 0) / series.data.length;
        output += `  ${this._colorize(symbol, color)} ${series.name}: 平均 ${(avg * 100).toFixed(1)}%\n`;
      });
    }
    
    return output;
  }

  /**
   * 生成热力图
   */
  generateHeatmap(data, options = {}) {
    const {
      title = '效果热力图',
      rows = 7,
      cols = 10
    } = options;

    if (!data || data.length === 0) {
      return this._colorize('暂无数据', 'gray');
    }

    const heatChars = ' ░▒▓█';
    const width = cols * 2 + 2;
    
    let output = this._renderTitle(title);
    output += '┌' + '─'.repeat(width - 2) + '┐\n';
    
    for (let r = 0; r < rows; r++) {
      output += '│ ';
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx < data.length) {
          const score = data[idx].score;
          const charIdx = Math.min(Math.floor(score * heatChars.length), heatChars.length - 1);
          const char = heatChars[charIdx];
          output += this._colorize(char + char, this._getScoreColor(score));
        } else {
          output += '  ';
        }
      }
      output += ' │\n';
    }
    
    output += '└' + '─'.repeat(width - 2) + '┘\n';
    output += `  ${this._colorize('低', 'red')} ░▒▓${this._colorize('高', 'green')}\n`;
    
    return output;
  }

  /**
   * 生成仪表盘
   */
  generateGauge(score, options = {}) {
    const {
      title = '效果评分',
      size = 20
    } = options;

    const color = this._getScoreColor(score);
    const percentage = Math.round(score * 100);
    
    let output = this._renderTitle(title);
    
    // 绘制半圆仪表盘
    const radius = Math.floor(size / 2);
    const canvas = Array(radius + 2).fill(null).map(() => Array(size + 2).fill(' '));
    
    // 绘制弧形
    for (let angle = 0; angle <= 180; angle += 5) {
      const rad = (angle * Math.PI) / 180;
      const x = Math.round(radius + Math.cos(rad) * radius);
      const y = Math.round(radius - Math.sin(rad) * radius);
      if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[0].length) {
        canvas[y][x] = '·';
      }
    }
    
    // 绘制指针
    const pointerAngle = (1 - score) * 180;
    const pointerRad = (pointerAngle * Math.PI) / 180;
    const px = Math.round(radius + Math.cos(pointerRad) * (radius - 2));
    const py = Math.round(radius - Math.sin(pointerRad) * (radius - 2));
    
    for (let i = 0; i <= radius - 2; i++) {
      const ix = Math.round(radius + Math.cos(pointerRad) * i);
      const iy = Math.round(radius - Math.sin(pointerRad) * i);
      if (iy >= 0 && iy < canvas.length && ix >= 0 && ix < canvas[0].length) {
        canvas[iy][ix] = this._colorize(i === radius - 2 ? '◆' : '│', color);
      }
    }
    
    // 渲染
    for (let row of canvas) {
      output += '  ' + row.join('') + '\n';
    }
    
    output += `     ${this._colorize(percentage.toString() + '%', color + ' bold')}\n`;
    output += `  ${this._colorize('0%', 'red')} ${' '.repeat(size - 6)} ${this._colorize('100%', 'green')}\n`;
    
    return output;
  }

  /**
   * 生成趋势分析报告
   */
  generateTrendAnalysis(data, options = {}) {
    const {
      title = '趋势分析报告',
      period = '7天'
    } = options;

    if (!data || data.length < 2) {
      return this._colorize('数据不足，无法分析趋势', 'gray');
    }

    const scores = data.map(d => d.score);
    const first = scores[0];
    const last = scores[scores.length - 1];
    const change = last - first;
    const changePercent = (change / first) * 100;
    
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    const max = Math.max(...scores);
    const min = Math.min(...scores);
    
    // 计算标准差
    const variance = scores.reduce((sum, s) => sum + Math.pow(s - avg, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    
    // 计算趋势方向
    const trendDirection = change > 0.05 ? '上升' : change < -0.05 ? '下降' : '稳定';
    const trendEmoji = change > 0.05 ? '📈' : change < -0.05 ? '📉' : '➡️';
    const trendColor = change > 0.05 ? 'green' : change < -0.05 ? 'red' : 'yellow';
    
    // 稳定性评估
    const stability = stdDev < 0.1 ? '稳定' : stdDev < 0.2 ? '波动' : '剧烈波动';
    const stabilityColor = stdDev < 0.1 ? 'green' : stdDev < 0.2 ? 'yellow' : 'red';
    
    let output = this._renderTitle(title);
    output += `📅 分析周期: ${period}\n`;
    output += `📊 数据点数: ${data.length}\n\n`;
    
    output += `${trendEmoji} 趋势方向: ${this._colorize(trendDirection, trendColor + ' bold')}\n`;
    output += `   变化幅度: ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}% (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%)\n\n`;
    
    output += `📈 统计数据:\n`;
    output += `   最高分: ${this._colorize((max * 100).toFixed(1) + '%', 'green')}\n`;
    output += `   最低分: ${this._colorize((min * 100).toFixed(1) + '%', 'red')}\n`;
    output += `   平均分: ${(avg * 100).toFixed(1)}%\n`;
    output += `   标准差: ${(stdDev * 100).toFixed(1)}%\n\n`;
    
    output += `🎯 稳定性: ${this._colorize(stability, stabilityColor)}\n`;
    
    // 建议
    output += `\n💡 建议:\n`;
    if (change < -0.1) {
      output += `   ${this._colorize('⚠️', 'red')} 效果下降明显，建议立即排查原因\n`;
    }
    if (stdDev > 0.15) {
      output += `   ${this._colorize('⚠️', 'yellow')} 波动较大，建议优化稳定性\n`;
    }
    if (avg < 0.7) {
      output += `   ${this._colorize('⚠️', 'red')} 平均分偏低，建议全面优化\n`;
    }
    if (change > 0 && avg >= 0.7 && stdDev < 0.15) {
      output += `   ${this._colorize('✅', 'green')} 表现良好，继续保持\n`;
    }
    
    return output;
  }

  /**
   * 导出为JSON格式（供其他工具使用）
   */
  exportToJSON(data, filepath) {
    const exportData = {
      generatedAt: new Date().toISOString(),
      version: '3.0.0',
      data: data
    };
    
    if (filepath) {
      fs.writeFileSync(filepath, JSON.stringify(exportData, null, 2));
    }
    
    return exportData;
  }

  // ============ 私有方法 ============

  _drawAxes(canvas, width, height) {
    // Y轴
    for (let y = 0; y < height; y++) {
      canvas[y][0] = '│';
    }
    // X轴
    for (let x = 0; x < width; x++) {
      canvas[height - 1][x] = '─';
    }
    // 原点
    canvas[height - 1][0] = '└';
  }

  _drawLine(canvas, data, width, height, minScore, range) {
    const plotWidth = width - 2;
    const plotHeight = height - 2;
    
    data.forEach((point, index) => {
      const x = Math.floor((index / (data.length - 1 || 1)) * plotWidth) + 1;
      const y = plotHeight - Math.floor(((point.score - minScore) / range) * plotHeight);
      
      if (y >= 0 && y < height - 1 && x < width) {
        canvas[y][x] = this._colorize('●', this._getScoreColor(point.score));
      }
    });
    
    // 连线
    for (let i = 0; i < data.length - 1; i++) {
      const x1 = Math.floor((i / (data.length - 1 || 1)) * plotWidth) + 1;
      const y1 = plotHeight - Math.floor(((data[i].score - minScore) / range) * plotHeight);
      const x2 = Math.floor(((i + 1) / (data.length - 1 || 1)) * plotWidth) + 1;
      const y2 = plotHeight - Math.floor(((data[i + 1].score - minScore) / range) * plotHeight);
      
      this._drawLineSegment(canvas, x1, y1, x2, y2);
    }
  }

  _drawSeries(canvas, data, width, height, minScore, range, symbol) {
    const plotWidth = width - 2;
    const plotHeight = height - 2;
    
    data.forEach((point, index) => {
      const x = Math.floor((index / (data.length - 1 || 1)) * plotWidth) + 1;
      const y = plotHeight - Math.floor(((point.score - minScore) / range) * plotHeight);
      
      if (y >= 0 && y < height - 1 && x < width) {
        canvas[y][x] = symbol;
      }
    });
  }

  _drawLineSegment(canvas, x1, y1, x2, y2) {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    let x = x1;
    let y = y1;
    
    while (true) {
      if (y >= 0 && y < canvas.length && x >= 0 && x < canvas[0].length) {
        if (canvas[y][x] === ' ') {
          canvas[y][x] = '·';
        }
      }
      
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }

  _renderTitle(title) {
    const padding = Math.floor((this.options.width - title.length) / 2);
    return '\n' + ' '.repeat(Math.max(0, padding)) + 
           this._colorize(title, 'bold') + '\n' +
           '─'.repeat(this.options.width) + '\n';
  }

  _renderCanvas(canvas) {
    return canvas.map(row => '  ' + row.join('')).join('\n') + '\n';
  }

  _renderLabels(data, width, minScore, maxScore) {
    let labels = '';
    if (data.length > 0) {
      labels += `  ${data[0].label || ''}`;
      const lastLabel = data[data.length - 1].label || '';
      const spaces = width - labels.length - lastLabel.length - 2;
      labels += ' '.repeat(Math.max(1, spaces)) + lastLabel + '\n';
    }
    labels += `  ${this._colorize(minScore.toFixed(2), 'gray')} (min)  ${this._colorize(maxScore.toFixed(2), 'gray')} (max)\n`;
    return labels;
  }

  _getScoreColor(score) {
    if (score >= 0.85) return 'green';
    if (score >= 0.7) return 'yellow';
    return 'red';
  }

  _colorize(text, color) {
    if (!this.options.colorEnabled) return text;
    
    const codes = color.split(' ').map(c => this.colors[c] || '');
    return codes.join('') + text + this.colors.reset;
  }
}

// ============ 快捷函数 ============

function createLineChart(data, options = {}) {
  const chart = new TrendChart(options);
  return chart.generateLineChart(data, options);
}

function createBarChart(data, options = {}) {
  const chart = new TrendChart(options);
  return chart.generateBarChart(data, options);
}

function createMultiSeriesChart(datasets, options = {}) {
  const chart = new TrendChart(options);
  return chart.generateMultiSeriesChart(datasets, options);
}

function createGauge(score, options = {}) {
  const chart = new TrendChart(options);
  return chart.generateGauge(score, options);
}

function createTrendAnalysis(data, options = {}) {
  const chart = new TrendChart(options);
  return chart.generateTrendAnalysis(data, options);
}

// ============ 导出 ============

module.exports = {
  TrendChart,
  createLineChart,
  createBarChart,
  createMultiSeriesChart,
  createGauge,
  createTrendAnalysis
};

// CLI测试
if (require.main === module) {
  const chart = new TrendChart({ colorEnabled: true });
  
  // 生成测试数据
  const testData = [
    { date: '2024-01-01', score: 0.72, label: '01/01' },
    { date: '2024-01-02', score: 0.75, label: '01/02' },
    { date: '2024-01-03', score: 0.78, label: '01/03' },
    { date: '2024-01-04', score: 0.74, label: '01/04' },
    { date: '2024-01-05', score: 0.82, label: '01/05' },
    { date: '2024-01-06', score: 0.85, label: '01/06' },
    { date: '2024-01-07', score: 0.88, label: '01/07' }
  ];
  
  console.log(chart.generateLineChart(testData, { title: 'AI效果趋势' }));
  console.log(chart.generateBarChart(testData, { title: '每日评分' }));
  console.log(chart.generateGauge(0.87, { title: '当前评分' }));
  console.log(chart.generateTrendAnalysis(testData, { title: '趋势分析' }));
}

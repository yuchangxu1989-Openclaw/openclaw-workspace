/**
 * detect-user-correction.js
 * 感知层探针：检测用户消息是否包含纠偏语义
 * 使用 LLM few-shot 判断，不依赖关键词匹配
 *
 * 输入：用户消息文本
 * 输出：{ isCorrection: bool, oldConcept: string, newConcept: string, keywords: string[] }
 */

const FEW_SHOT_PROMPT = `你是一个语义分析器。判断用户消息是否在纠正/纠偏一个已有认知。

纠偏的特征：用户指出之前的理解是错误的，并给出正确的版本。

示例：
用户: "不是Python是Go，我们后端用的是Go"
输出: {"isCorrection":true,"oldConcept":"后端用Python","newConcept":"后端用Go","keywords":["后端","语言","Go","Python"]}

用户: "你理解错了，我说的截止日期是下周五不是这周五"
输出: {"isCorrection":true,"oldConcept":"截止日期是这周五","newConcept":"截止日期是下周五","keywords":["截止日期","周五"]}

用户: "你搞混了，Alice是设计师，Bob才是工程师"
输出: {"isCorrection":true,"oldConcept":"Alice是工程师/Bob是设计师","newConcept":"Alice是设计师，Bob是工程师","keywords":["Alice","Bob","设计师","工程师"]}

用户: "今天天气真好"
输出: {"isCorrection":false,"oldConcept":"","newConcept":"","keywords":[]}

用户: "帮我查一下明天的日程"
输出: {"isCorrection":false,"oldConcept":"","newConcept":"","keywords":[]}

现在分析以下用户消息，只输出JSON，不要其他内容：
用户: "{USER_MESSAGE}"
输出:`;

/**
 * 检测用户消息是否为纠偏
 * @param {string} userMessage - 用户消息文本
 * @param {function} llmCall - LLM调用函数，签名: (prompt: string) => Promise<string>
 * @returns {Promise<{isCorrection: boolean, oldConcept: string, newConcept: string, keywords: string[]}>}
 */
async function detectUserCorrection(userMessage, llmCall) {
  if (!userMessage || typeof userMessage !== 'string' || userMessage.trim().length === 0) {
    return { isCorrection: false, oldConcept: '', newConcept: '', keywords: [] };
  }

  const prompt = FEW_SHOT_PROMPT.replace('{USER_MESSAGE}', userMessage.replace(/"/g, '\\"'));

  try {
    const response = await llmCall(prompt);
    const jsonStr = response.trim().replace(/^```json?\s*/, '').replace(/\s*```$/, '');
    const result = JSON.parse(jsonStr);

    return {
      isCorrection: Boolean(result.isCorrection),
      oldConcept: String(result.oldConcept || ''),
      newConcept: String(result.newConcept || ''),
      keywords: Array.isArray(result.keywords) ? result.keywords.map(String) : [],
    };
  } catch (err) {
    console.error('[detect-user-correction] LLM解析失败:', err.message);
    return { isCorrection: false, oldConcept: '', newConcept: '', keywords: [] };
  }
}

module.exports = { detectUserCorrection, FEW_SHOT_PROMPT };

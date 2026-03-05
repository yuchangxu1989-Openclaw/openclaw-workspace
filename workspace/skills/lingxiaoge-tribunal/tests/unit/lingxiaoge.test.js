/**
 * 凌霄阁裁决引擎 v1.0 — 单元测试
 *
 * LLM调用全部mock，不发起实际网络请求。
 * 运行: node --test tests/unit/lingxiaoge.test.js
 */

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  SEATS,
  MERGED_SEATS,
  getSeatsForMode,
  round1Prompt,
  round2Prompt,
  round3Prompt,
  convene,
  parseArgs,
} = require('../../council.js');

// ─── Helpers ────────────────────────────────────────────────────────

let callCount = 0;

/** Default mock: returns a deterministic string per call.
 *  Uses specific prompt markers to distinguish rounds (since Round 3 contains R1/R2 text). */
async function mockLLM(prompt, _opts) {
  callCount++;
  // Match on the unique heading marker for each round
  if (prompt.includes('Round 3 · 终审裁决')) {
    return '【核心分歧】方向一致，细节分歧\n【事实判断】可验证\n【价值判断】无重大冲突\n【裁决】建议推进\n【风险缓解】增加监控\n【执行建议】分阶段实施\n【第一性原理检验】未偏离\n【综合评分】8.5/10';
  }
  if (prompt.includes('Round 2 · 交叉Battle')) {
    return '【挑战】\n1. 对道席：论据不足\n2. 对战席：资源估算偏乐观\n【回应】已充分考虑\n【立场修正】坚持\n【信心度变化】从8到7，因交叉质疑';
  }
  if (prompt.includes('Round 1 · 独立审议')) {
    return '【立场】支持\n【核心论点】\n1. 论点A\n2. 论点B\n3. 论点C\n【关键风险】无重大风险\n【信心度】8/10\n【一句话结论】应当推进';
  }
  return 'mock response';
}

/** Mock that throws for a specific seat */
function failingSeatMock(failSeatId) {
  return async (prompt, _opts) => {
    // Check if prompt is for the failing seat (Round 1 has seat title in prompt)
    const failSeat = SEATS.find(s => s.id === failSeatId);
    if (failSeat && prompt.includes(failSeat.title)) {
      throw new Error(`LLM timeout for ${failSeatId}`);
    }
    return mockLLM(prompt, _opts);
  };
}

// ─── Tests ──────────────────────────────────────────────────────────

describe('getSeatsForMode', () => {
  it('mode 7 returns all 7 seats', () => {
    const seats = getSeatsForMode('7');
    assert.equal(seats.length, 7);
    assert.deepEqual(seats.map(s => s.id), ['dao', 'zhan', 'gong', 'dun', 'yan', 'yuan', 'heng']);
  });

  it('mode 5 returns 5 seats with merged gong_dun and yan_yuan', () => {
    const seats = getSeatsForMode('5');
    assert.equal(seats.length, 5);
    const ids = seats.map(s => s.id);
    assert.ok(ids.includes('dao'));
    assert.ok(ids.includes('zhan'));
    assert.ok(ids.includes('gong_dun'));
    assert.ok(ids.includes('yan_yuan'));
    assert.ok(ids.includes('heng'));
  });

  it('mode 3 returns dao, zhan, heng only', () => {
    const seats = getSeatsForMode('3');
    assert.equal(seats.length, 3);
    assert.deepEqual(seats.map(s => s.id), ['dao', 'zhan', 'heng']);
  });

  it('invalid mode throws', () => {
    assert.throws(() => getSeatsForMode('4'), /Invalid mode/);
  });
});

describe('Prompt generation', () => {
  it('round1Prompt includes seat role and topic', () => {
    const seat = SEATS[0]; // dao
    const prompt = round1Prompt('测试议题', '测试背景', seat);
    assert.ok(prompt.includes('道席'));
    assert.ok(prompt.includes('第一性原理守护者'));
    assert.ok(prompt.includes('测试议题'));
    assert.ok(prompt.includes('测试背景'));
    assert.ok(prompt.includes('Round 1'));
  });

  it('round1Prompt handles empty context', () => {
    const seat = SEATS[0];
    const prompt = round1Prompt('议题', '', seat);
    assert.ok(prompt.includes('无额外背景'));
  });

  it('round2Prompt includes other seats\' round1 results', () => {
    const seat = SEATS[0]; // dao
    const r1Results = [
      { seat: 'dao', seatTitle: '🏛️ 道席', result: '道席观点' },
      { seat: 'zhan', seatTitle: '⚔️ 战席', result: '战席观点' },
      { seat: 'gong', seatTitle: '🔧 工席', result: '工席观点' },
    ];
    const prompt = round2Prompt('议题', r1Results, seat);
    assert.ok(prompt.includes('战席观点'), 'should include other seats');
    assert.ok(prompt.includes('工席观点'), 'should include other seats');
    assert.ok(prompt.includes('Round 2'));
    // Should NOT include dao's view in "others" section directly; but it's in "你的Round 1立场"
    assert.ok(prompt.includes('道席观点'), 'should include own view in recap');
  });

  it('round3Prompt includes both round1 and round2 results', () => {
    const r1 = [{ seat: 'dao', seatTitle: '道席', result: 'R1道' }];
    const r2 = [{ seat: 'dao', seatTitle: '道席', result: 'R2道' }];
    const prompt = round3Prompt('议题', r1, r2);
    assert.ok(prompt.includes('R1道'));
    assert.ok(prompt.includes('R2道'));
    assert.ok(prompt.includes('Round 3'));
    assert.ok(prompt.includes('综合评分'));
  });
});

describe('convene — full flow', () => {
  it('mode 7 calls LLM 15 times (7+7+1) and returns structured result', async () => {
    callCount = 0;
    const result = await convene('测试议题', '测试背景', {
      mode: '7',
      _callLLM: mockLLM,
      apiKey: 'test-key',
    });

    assert.equal(result.topic, '测试议题');
    assert.equal(result.mode, '7');
    assert.equal(result.model, 'glm-5');
    assert.equal(result.rounds.round1.length, 7);
    assert.equal(result.rounds.round2.length, 7);
    assert.ok(result.rounds.round3.verdict);
    assert.equal(result.rounds.round3.score, 8.5);
    assert.equal(typeof result.duration_ms, 'number');
    assert.ok(result.duration_ms >= 0);
    // 7 (R1) + 7 (R2) + 1 (R3) = 15
    assert.equal(callCount, 15);
  });

  it('mode 5 calls LLM 11 times (5+5+1)', async () => {
    callCount = 0;
    const result = await convene('议题', '', {
      mode: '5',
      _callLLM: mockLLM,
      apiKey: 'test-key',
    });
    assert.equal(result.rounds.round1.length, 5);
    assert.equal(result.rounds.round2.length, 5);
    assert.equal(callCount, 11);
  });

  it('mode 3 calls LLM 7 times (3+3+1)', async () => {
    callCount = 0;
    const result = await convene('议题', '', {
      mode: '3',
      _callLLM: mockLLM,
      apiKey: 'test-key',
    });
    assert.equal(result.rounds.round1.length, 3);
    assert.equal(result.rounds.round2.length, 3);
    assert.equal(callCount, 7);
  });

  it('single agent failure marks as absent, does not crash', async () => {
    const result = await convene('议题', '', {
      mode: '7',
      _callLLM: failingSeatMock('gong'),
      apiKey: 'test-key',
    });

    const gongR1 = result.rounds.round1.find(r => r.seat === 'gong');
    assert.equal(gongR1.status, 'absent');
    assert.ok(gongR1.result.includes('缺席'));
    assert.ok(gongR1.error);

    // Other seats should be ok
    const daoR1 = result.rounds.round1.find(r => r.seat === 'dao');
    assert.equal(daoR1.status, 'ok');

    // Still produces round3
    assert.ok(result.rounds.round3.verdict);
  });

  it('round2 results reference round1 results', async () => {
    // Verify the mock receives round1 context in round2 prompts
    let round2Prompts = [];
    const captureLLM = async (prompt, opts) => {
      if (prompt.includes('Round 2 · 交叉Battle')) {
        round2Prompts.push(prompt);
      }
      return mockLLM(prompt, opts);
    };

    await convene('议题', '', {
      mode: '3',
      _callLLM: captureLLM,
      apiKey: 'test-key',
    });

    assert.equal(round2Prompts.length, 3);
    // Each round2 prompt should contain round1 results from other seats
    for (const p of round2Prompts) {
      assert.ok(p.includes('论点A') || p.includes('应当推进'),
        'Round 2 prompt should contain Round 1 output');
    }
  });

  it('round3 prompt contains both round1 and round2 data', async () => {
    let r3Prompt = '';
    const captureLLM = async (prompt, opts) => {
      if (prompt.includes('Round 3')) {
        r3Prompt = prompt;
      }
      return mockLLM(prompt, opts);
    };

    await convene('议题X', '背景Y', {
      mode: '3',
      _callLLM: captureLLM,
      apiKey: 'test-key',
    });

    assert.ok(r3Prompt.includes('Round 1'), 'Round 3 prompt should reference Round 1');
    assert.ok(r3Prompt.includes('Round 2'), 'Round 3 prompt should reference Round 2');
    assert.ok(r3Prompt.includes('议题X'));
  });

  it('throws if topic is missing', async () => {
    await assert.rejects(
      () => convene('', '', { _callLLM: mockLLM, apiKey: 'k' }),
      /Topic is required/
    );
  });

  it('defaults to mode 7 if not specified', async () => {
    callCount = 0;
    const result = await convene('议题', '', {
      _callLLM: mockLLM,
      apiKey: 'test-key',
    });
    assert.equal(result.mode, '7');
    assert.equal(result.rounds.round1.length, 7);
  });
});

describe('parseArgs', () => {
  it('parses all CLI flags', () => {
    const args = parseArgs([
      '--topic', '我的议题',
      '--context', '背景信息',
      '--mode', '5',
      '--model', 'gpt-4',
      '--baseUrl', 'https://api.openai.com/v1',
      '--apiKey', 'sk-xxx',
      '--timeout', '60000',
      '--serial',
    ]);
    assert.equal(args.topic, '我的议题');
    assert.equal(args.context, '背景信息');
    assert.equal(args.mode, '5');
    assert.equal(args.model, 'gpt-4');
    assert.equal(args.baseUrl, 'https://api.openai.com/v1');
    assert.equal(args.apiKey, 'sk-xxx');
    assert.equal(args.timeout, 60000);
    assert.equal(args.parallel, false);
  });

  it('--help flag is captured', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });

  it('returns empty object for no args', () => {
    const args = parseArgs([]);
    assert.equal(Object.keys(args).length, 0);
  });
});

describe('Score extraction', () => {
  it('extracts numeric score from verdict text', async () => {
    const customMock = async (prompt) => {
      if (prompt.includes('Round 3')) {
        return '【裁决】通过\n【综合评分】7.5/10';
      }
      return mockLLM(prompt);
    };
    const result = await convene('议题', '', {
      mode: '3',
      _callLLM: customMock,
      apiKey: 'test-key',
    });
    assert.equal(result.rounds.round3.score, 7.5);
  });

  it('score is null when not present in verdict', async () => {
    const noScoreMock = async (prompt) => {
      if (prompt.includes('Round 3')) {
        return '【裁决】通过，没有评分';
      }
      return mockLLM(prompt);
    };
    const result = await convene('议题', '', {
      mode: '3',
      _callLLM: noScoreMock,
      apiKey: 'test-key',
    });
    assert.equal(result.rounds.round3.score, null);
  });
});

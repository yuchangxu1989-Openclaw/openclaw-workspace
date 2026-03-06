/**
 * 凌霄阁裁决引擎 v2.0 — 单元测试
 *
 * convene() 现在是纯函数，返回prompt列表，不调用LLM。
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
  buildRound2Prompts,
  buildRound3Prompt,
  parseArgs,
} = require('../../council.js');

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
    const seat = SEATS[0];
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
    const seat = SEATS[0];
    const r1Results = [
      { seat: 'dao', seatTitle: '🏛️ 道席', result: '道席观点' },
      { seat: 'zhan', seatTitle: '⚔️ 战席', result: '战席观点' },
      { seat: 'gong', seatTitle: '🔧 工席', result: '工席观点' },
    ];
    const prompt = round2Prompt('议题', r1Results, seat);
    assert.ok(prompt.includes('战席观点'));
    assert.ok(prompt.includes('工席观点'));
    assert.ok(prompt.includes('Round 2'));
    assert.ok(prompt.includes('道席观点'));
  });

  it('round3Prompt includes both round1 and round2 results', () => {
    const r1 = [{ seat: 'dao', seatTitle: '道席', result: 'R1道' }];
    const r2 = [{ seat: 'dao', seatTitle: '道席', result: 'R2道' }];
    const prompt = round3Prompt('议题', r1, r2);
    assert.ok(prompt.includes('R1道'));
    assert.ok(prompt.includes('R2道'));
    assert.ok(prompt.includes('Round 3'));
  });
});

describe('convene — prompt-only (no LLM calls)', () => {
  it('mode 7 returns 7 round1 prompts', () => {
    const result = convene('测试议题', '测试背景', { mode: '7' });
    assert.equal(result.topic, '测试议题');
    assert.equal(result.mode, '7');
    assert.equal(result.rounds.round1.prompts.length, 7);
    assert.ok(result.rounds.round1.parallel);
    // Each prompt should contain the topic
    for (const p of result.rounds.round1.prompts) {
      assert.ok(p.prompt.includes('测试议题'));
      assert.ok(p.seat);
      assert.ok(p.seatTitle);
    }
  });

  it('mode 5 returns 5 round1 prompts', () => {
    const result = convene('议题', '', { mode: '5' });
    assert.equal(result.rounds.round1.prompts.length, 5);
  });

  it('mode 3 returns 3 round1 prompts', () => {
    const result = convene('议题', '', { mode: '3' });
    assert.equal(result.rounds.round1.prompts.length, 3);
  });

  it('throws if topic is missing', () => {
    assert.throws(() => convene('', ''), /Topic is required/);
  });

  it('defaults to mode 7', () => {
    const result = convene('议题', '');
    assert.equal(result.mode, '7');
    assert.equal(result.rounds.round1.prompts.length, 7);
  });

  it('includes _callLLM_note about caller responsibility', () => {
    const result = convene('议题', '');
    assert.ok(result._callLLM_note.includes('调用方'));
  });
});

describe('buildRound2Prompts', () => {
  it('generates prompts for each seat using round1 results', () => {
    const r1Results = [
      { seat: 'dao', seatTitle: '道席', result: 'R1道' },
      { seat: 'zhan', seatTitle: '战席', result: 'R1战' },
      { seat: 'heng', seatTitle: '衡席', result: 'R1衡' },
    ];
    const prompts = buildRound2Prompts('议题', r1Results, '3');
    assert.equal(prompts.length, 3);
    for (const p of prompts) {
      assert.ok(p.prompt.includes('Round 2'));
      assert.ok(p.prompt.includes('R1'));
    }
  });
});

describe('buildRound3Prompt', () => {
  it('generates a single round3 prompt with both round results', () => {
    const r1 = [{ seat: 'dao', seatTitle: '道席', result: 'R1道' }];
    const r2 = [{ seat: 'dao', seatTitle: '道席', result: 'R2道' }];
    const result = buildRound3Prompt('议题', r1, r2);
    assert.ok(result.prompt.includes('Round 3'));
    assert.ok(result.prompt.includes('R1道'));
    assert.ok(result.prompt.includes('R2道'));
  });
});

describe('parseArgs', () => {
  it('parses CLI flags', () => {
    const args = parseArgs([
      '--topic', '我的议题',
      '--context', '背景信息',
      '--mode', '5',
    ]);
    assert.equal(args.topic, '我的议题');
    assert.equal(args.context, '背景信息');
    assert.equal(args.mode, '5');
  });

  it('--help flag is captured', () => {
    assert.equal(parseArgs(['--help']).help, true);
    assert.equal(parseArgs(['-h']).help, true);
  });
});

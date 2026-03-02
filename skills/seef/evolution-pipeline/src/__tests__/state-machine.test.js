/**
 * @fileoverview 状态机模块单元测试
 * @module __tests__/state-machine.test
 */

'use strict';

// 模拟测试框架
let passCount = 0;
let failCount = 0;

function describe(name, fn) {
  console.log(`\n📦 ${name}`);
  fn();
}

function it(name, fn) {
  try {
    fn();
    passCount++;
    console.log(`  ✅ ${name}`);
  } catch (error) {
    failCount++;
    console.log(`  ❌ ${name}: ${error.message}`);
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`期望 ${expected}，实际 ${actual}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`期望为真，实际 ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`期望为假，实际 ${actual}`);
      }
    }
  };
}

// 异步运行测试
async function runTests() {
  const fs = await import('fs/promises');
  const { StateMachine, PipelineState, STATE_TRANSITIONS, STATE_METADATA } = await import('../state-machine.js');

  const stateDir = '/tmp/test-state-machine';

  // 测试套件
  describe('StateMachine', () => {
    it('应该使用IDLE作为初始状态', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      expect(sm.getCurrentState()).toBe(PipelineState.IDLE);
      await sm.destroy();
    });

    it('应该正确验证状态转换', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      expect(sm.canTransitionTo(PipelineState.ANALYZING)).toBeTruthy();
      expect(sm.canTransitionTo(PipelineState.COMPLETED)).toBeFalsy();
      await sm.destroy();
    });

    it('应该获取允许的转换状态', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      const allowed = sm.getAllowedTransitions();
      expect(allowed).toEqual(STATE_TRANSITIONS[PipelineState.IDLE]);
      await sm.destroy();
    });

    it('应该获取状态元数据', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      const metadata = sm.getStateMetadata();
      expect(metadata.isTerminal).toBeFalsy();
      expect(metadata.description).toBe('等待触发');
      await sm.destroy();
    });

    it('应该正确执行状态转换', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      
      await sm.transitionTo(PipelineState.ANALYZING, { test: true }, '测试转换');
      expect(sm.getCurrentState()).toBe(PipelineState.ANALYZING);
      
      const history = sm.getStateHistory();
      expect(history.length).toBe(1);
      expect(history[0].from).toBe(PipelineState.IDLE);
      expect(history[0].to).toBe(PipelineState.ANALYZING);
      await sm.destroy();
    });

    it('应该拒绝非法状态转换', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      
      let errorThrown = false;
      try {
        await sm.transitionTo(PipelineState.COMPLETED);
      } catch (e) {
        errorThrown = true;
        expect(e.message.includes('非法状态转换')).toBeTruthy();
      }
      expect(errorThrown).toBeTruthy();
      await sm.destroy();
    });

    it('应该正确获取状态快照', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      
      const snapshot = sm.getSnapshot();
      expect(snapshot.skillId).toBe('test-skill');
      expect(snapshot.currentState).toBe(PipelineState.IDLE);
      expect(snapshot.metadata).toBeTruthy();
      await sm.destroy();
    });

    it('应该正确重置状态机', async () => {
      try {
        await fs.rm(stateDir, { recursive: true, force: true });
      } catch {}
      await fs.mkdir(stateDir, { recursive: true });
      
      const sm = new StateMachine({ skillId: 'test-skill', stateDir });
      await sm.initialize();
      
      await sm.transitionTo(PipelineState.ANALYZING);
      expect(sm.getCurrentState()).toBe(PipelineState.ANALYZING);
      
      await sm.reset('测试重置');
      expect(sm.getCurrentState()).toBe(PipelineState.IDLE);
      expect(sm.getStateHistory().length).toBe(0);
      await sm.destroy();
    });
  });
}

// 运行测试
console.log('🧪 运行 StateMachine 单元测试...');

runTests().then(() => {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log(`测试结果: 通过 ${passCount}, 失败 ${failCount}`);
  console.log('═══════════════════════════════════════════════════════════');
  process.exit(failCount > 0 ? 1 : 0);
}).catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});

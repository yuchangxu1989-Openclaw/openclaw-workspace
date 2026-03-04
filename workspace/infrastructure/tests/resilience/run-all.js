'use strict';

/**
 * Resilience Test Runner — runs all resilience test suites
 */

async function runAll() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║        L3 Resilience Test Suite — Day 2          ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let totalPassed = 0;
  let totalFailed = 0;

  const suites = [
    { name: 'Error Handler', mod: require('./test-error-handler') },
    { name: 'Resilient Bus', mod: require('./test-resilient-bus') },
    { name: 'Resilient Dispatcher', mod: require('./test-resilient-dispatcher') },
    { name: 'Config Self-Healer', mod: require('./test-config-self-healer') },
  ];

  for (const suite of suites) {
    try {
      const { passed, failed } = await suite.mod.run();
      totalPassed += passed;
      totalFailed += failed;
    } catch (err) {
      console.error(`\n💥 Suite "${suite.name}" crashed: ${err.message}`);
      totalFailed++;
    }
  }

  console.log('\n══════════════════════════════════════════════════');
  console.log(`📊 TOTAL: ${totalPassed} passed, ${totalFailed} failed, ${totalPassed + totalFailed} tests`);
  console.log('══════════════════════════════════════════════════\n');

  return { passed: totalPassed, failed: totalFailed };
}

if (require.main === module) {
  runAll().then(({ failed }) => process.exit(failed > 0 ? 1 : 0));
}

module.exports = { runAll };

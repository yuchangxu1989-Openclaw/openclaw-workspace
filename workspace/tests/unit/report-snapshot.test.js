/**
 * Unit tests for report-snapshot mechanism
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { snapshot, verify, fileHash } = require('../../infrastructure/report-snapshot');

const tmpDir = path.join(os.tmpdir(), 'report-snapshot-test-' + Date.now());

function setup() {
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(path.join(tmpDir, 'report.md'), '# Test Report\nScore: 38/38\n');
  fs.writeFileSync(path.join(tmpDir, 'data.json'), '{"passed":38,"failed":0}\n');
  fs.writeFileSync(path.join(tmpDir, 'metrics.csv'), 'test,result\na,pass\nb,pass\n');
}

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

function assert(condition, msg) {
  if (!condition) throw new Error('FAIL: ' + msg);
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
  } catch (e) {
    console.log(`  ❌ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

// Run
setup();
console.log('report-snapshot tests:');

test('snapshot creates .snapshot.json', () => {
  const reportPath = path.join(tmpDir, 'report.md');
  const dataFiles = [path.join(tmpDir, 'data.json'), path.join(tmpDir, 'metrics.csv')];
  const snap = snapshot(reportPath, dataFiles);
  
  assert(snap.version === 1, 'version should be 1');
  assert(snap.reportHash, 'should have reportHash');
  assert(Object.keys(snap.dataFiles).length === 2, 'should track 2 data files');
  assert(fs.existsSync(reportPath + '.snapshot.json'), 'snapshot file should exist');
});

test('verify returns VALID for unchanged files', () => {
  const snapPath = path.join(tmpDir, 'report.md.snapshot.json');
  const result = verify(snapPath);
  assert(result.status === 'VALID', `expected VALID, got ${result.status}`);
  assert(result.changes.length === 0, 'should have no changes');
});

test('verify detects modified data file', () => {
  const dataPath = path.join(tmpDir, 'data.json');
  fs.writeFileSync(dataPath, '{"passed":37,"failed":1}\n'); // changed!
  
  const snapPath = path.join(tmpDir, 'report.md.snapshot.json');
  const result = verify(snapPath);
  assert(result.status === 'STALE', `expected STALE, got ${result.status}`);
  assert(result.changes.some(c => c.reason === 'DATA_MODIFIED'), 'should report DATA_MODIFIED');
});

test('verify detects deleted data file', () => {
  fs.unlinkSync(path.join(tmpDir, 'metrics.csv'));
  
  const snapPath = path.join(tmpDir, 'report.md.snapshot.json');
  const result = verify(snapPath);
  assert(result.status === 'STALE', 'should be STALE');
  assert(result.changes.some(c => c.reason === 'FILE_DELETED'), 'should report FILE_DELETED');
});

test('verify detects modified report', () => {
  fs.writeFileSync(path.join(tmpDir, 'report.md'), '# Changed Report\n');
  
  const snapPath = path.join(tmpDir, 'report.md.snapshot.json');
  const result = verify(snapPath);
  assert(result.status === 'STALE', 'should be STALE');
  assert(result.changes.some(c => c.reason === 'REPORT_MODIFIED'), 'should report REPORT_MODIFIED');
});

test('snapshot handles missing data file gracefully', () => {
  const reportPath = path.join(tmpDir, 'report.md');
  const snap = snapshot(reportPath, ['/nonexistent/file.txt']);
  const entry = Object.values(snap.dataFiles)[0];
  assert(entry.error === 'FILE_NOT_FOUND', 'should mark as FILE_NOT_FOUND');
});

test('snapshot throws for missing report', () => {
  try {
    snapshot('/nonexistent/report.md', []);
    assert(false, 'should have thrown');
  } catch (e) {
    assert(e.message.includes('Report not found'), 'should mention report not found');
  }
});

cleanup();
console.log('\nDone.');

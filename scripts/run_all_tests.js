const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const testDir = path.join(__dirname, '../test');
const files = fs.readdirSync(testDir).filter(f => f.endsWith('.test.js')).sort();

let passedSuites = 0;
let failedSuites = 0;
let totalIndividualTests = 0;

console.log(`Running ${files.length} test suites...\n`);

for (const file of files) {
  const filePath = path.join(testDir, file);
  try {
    const output = execSync(`node "${filePath}"`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    passedSuites++;
    
    // Count checks / assertions / tests marked with checkmarks or passed indicators
    const checkMarks = (output.match(/✅/g) || []).length;
    const testLines = (output.match(/(?:pass|passed|✓|test \d+)/gi) || []).length;
    const count = Math.max(checkMarks, 1);
    totalIndividualTests += count;

    console.log(`PASS: ${file} (${count} checks/tests)`);
  } catch (err) {
    failedSuites++;
    console.error(`FAIL: ${file} -> ${(err.stderr || err.message).slice(0, 300)}`);
  }
}

console.log('\n======================================');
console.log(`Test suites: ${passedSuites} / ${files.length} PASS`);
console.log(`Total estimated checks passed: ${totalIndividualTests}`);



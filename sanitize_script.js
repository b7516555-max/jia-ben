const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.indexOf('<script type="module"');
if (start === -1) {
  console.error('NO SCRIPT TAG FOUND');
  process.exit(1);
}
const open = html.indexOf('>', start);
const close = html.indexOf('</script>', open);
if (open === -1 || close === -1) {
  console.error('SCRIPT TAG MALFORMED');
  process.exit(1);
}
let code = html.slice(open + 1, close);
code = code.replace(/import\s+\{[^}]*\}\s+from\s+"https:[^;]*;/g, '// import removed');
code = code.replace(/import\s+\{[^}]*\}\s+from\s+"[^;]*";/g, '// import removed');
fs.writeFileSync(path.join(__dirname, 'tmp_sanitized.js'), code, 'utf8');
console.log('WROTE tmp_sanitized.js');

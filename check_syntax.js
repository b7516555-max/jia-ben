const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const start = html.indexOf('<script type="module"');
if (start === -1) {
  console.error('NO SCRIPT FOUND');
  process.exit(1);
}
const open = html.indexOf('>', start);
const close = html.indexOf('</script>', open);
if (open === -1 || close === -1) {
  console.error('SCRIPT TAG MALFORMED');
  process.exit(1);
}
const code = html.slice(open + 1, close);
try {
  new Function(code);
  console.log('SCRIPT SYNTAX OK');
} catch (e) {
  console.error('SYNTAX ERROR:', e && e.message);
  process.exit(1);
}

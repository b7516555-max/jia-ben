import fs from 'fs';
import vm from 'vm';
const html = fs.readFileSync('index.html', 'utf8');
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
const code = html.slice(open + 1, close);
const context = vm.createContext(globalThis);
const module = new vm.SourceTextModule(code, { context, identifier: 'index-module' });
await module.link(async (specifier) => {
  return new vm.SyntheticModule([], function () {}, { context });
});
await module.evaluate();
console.log('MODULE SYNTAX OK');

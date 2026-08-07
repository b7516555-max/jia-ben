import re
import subprocess
from pathlib import Path
path = Path('index.html')
text = path.read_text(encoding='utf-8')
match = re.search(r'<script[^>]*type="module"[^>]*>([\s\S]*?)</script>', text, re.I)
if not match:
    print('NO SCRIPT FOUND')
    raise SystemExit(1)
code = match.group(1)
# Check for common JavaScript syntax issues by brute-force parsing with esprima if available
try:
    import esprima
    esprima.parseScript(code)
    print('SCRIPT SYNTAX OK')
    raise SystemExit(0)
except ModuleNotFoundError:
    print('esprima not installed; trying runtime syntax check with node')
except Exception as e:
    print('SYNTAX ERROR:', e)
    raise SystemExit(1)

# Write module script to a temporary file and validate with node --check
tmp_path = Path('tmp_check.mjs')
tmp_path.write_text(code, encoding='utf-8')
proc = subprocess.run(['node', '--check', str(tmp_path)], capture_output=True, text=True)
print(proc.stdout, end='')
if proc.returncode != 0:
    print(proc.stderr, end='')
    raise SystemExit(proc.returncode)
print('SCRIPT SYNTAX OK')

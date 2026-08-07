from pathlib import Path
import re
text = Path("index.html").read_text(encoding="utf-8")
ids = set()
for part in text.split('id="')[1:]:
    ids.add(part.split('"',1)[0])
for part in text.split("id='")[1:]:
    ids.add(part.split("'",1)[0])
ids_js = set()
for m in re.findall(r'document\.getElementById\((?:"([^\"]+)"|\'([^\']+)\')\)', text):
    ids_js.add(m[0] or m[1])
miss = sorted([i for i in ids_js if i and i not in ids])
print('JS refs', len(ids_js), 'HTML ids', len(ids), 'missing', miss)

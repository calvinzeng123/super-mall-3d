"""Fetch only the pinned public redistributable assets; verify every byte."""
from pathlib import Path
import json,sys,urllib.request,hashlib
ROOT=Path(__file__).resolve().parents[2]
out=Path(sys.argv[1]) if len(sys.argv)>1 else Path('/tmp/yunlan-fps-source')
out.mkdir(parents=True,exist_ok=True)
manifest=json.loads((ROOT/'assets/models/fps/sources.json').read_text())
for source in manifest['downloads']:
 path=out/source['sourceFile']
 if not path.exists() or hashlib.sha256(path.read_bytes()).hexdigest()!=source['sha256']:
  with urllib.request.urlopen(source['url'],timeout=120) as response:path.write_bytes(response.read())
 data=path.read_bytes()
 if len(data)!=source['bytes'] or hashlib.sha256(data).hexdigest()!=source['sha256']:
  raise ValueError('Source hash does not match: '+source['sourceFile'])
 print(source['sourceFile'],len(data),'verified')

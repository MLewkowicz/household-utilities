"""Whitelist source geometry; drop metadata, external references and backgrounds.
Run this, then `node scripts/size-art/normalize.mjs` to measure visible geometry.
"""
import json,re,xml.etree.ElementTree as E
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'manifest.json').read_text())
allowed={'g','path','rect','circle','ellipse','polygon','polyline','line'}
attrs={'d','transform','x','y','width','height','rx','ry','cx','cy','r','points','x1','x2','y1','y2','fill-rule'}
def clean(e):
 tag=e.tag.split('}')[-1]
 if tag not in allowed:return ''
 style=dict(re.findall(r'([\w-]+)\s*:\s*([^;]+)',e.get('style','')))
 fill=e.get('fill',style.get('fill',''))
 if fill in ['white','#fff','#ffffff']:return ''
 out=E.Element(tag,{k:re.sub(r'\s+',' ',v).strip() for k,v in e.attrib.items() if k in attrs})
 if style.get('fill-rule'):out.set('fill-rule',style['fill-rule'])
 if fill=='none':out.set('fill','none')
 for child in e:
  value=clean(child)
  if value:out.append(E.fromstring(value))
 return E.tostring(out,encoding='unicode')
result={}
for key,m in manifest.items():
 assert m['licenseVerified'],key
 tree=E.parse(root/'sources'/f'{key}.svg').getroot()
 result[key]={'art':''.join(clean(e) for e in tree),'axis':m['axis'],'source':m['source'],'author':m['attribution']['author'],'license':m['attribution']['license']}
(root/'sanitized.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':'))+'\n')

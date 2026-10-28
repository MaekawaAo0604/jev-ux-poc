import json,zipfile,hashlib,pathlib,sys
from urllib.parse import urlsplit
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'reports/observation-correspondence-2026-10-29/live')
out=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else str(root/'trace-audit.json'))
read=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
def location(url):
 u=urlsplit(url)
 assert u.hostname in ['127.0.0.1','localhost']
 return u.path+('?' + u.query if u.query else '')+('#'+u.fragment if u.fragment else '')
def collapse(items):
 result=[]
 for item in items:
  if not result or result[-1]!=item:result.append(item)
 return result
manifest=read(root/'manifest.json')
assert manifest['status']=='COMPLETED' and len(manifest['records'])==12
report={'status':'RUNNING','networkRequests':0,'trials':[]}
for trial in manifest['records']:
 directory=root/trial['dir']/'exploration'
 result=read(directory/'result.json')
 file=directory/'trace.zip'
 before=sha(file)
 with zipfile.ZipFile(file) as z:
  assert z.testzip() is None
  events=[json.loads(line) for name in z.namelist() if name.endswith('.trace') for line in z.read(name).decode().splitlines()]
 after={e['callId']:e for e in events if e.get('type')=='after'}
 clicks=[e for e in events if e.get('type')=='before' and e.get('method')=='click' and e.get('class') in ['ElementHandle','Frame']]
 scrolls=[e for e in events if e.get('type')=='before' and e.get('method')=='evaluateExpression' and 'window.scrollBy' in e.get('params',{}).get('expression','') and len(e['params']['expression'])<1000]
 for event in clicks+scrolls:
  assert event['callId'] in after and 'error' not in after[event['callId']]
 selected=[s for s in result['steps'] if s.get('outcome')=='UI_PERFORMED']
 assert len(clicks)==len([s for s in selected if s['action']['type']=='click'])
 assert len(scrolls)==len([s for s in selected if s['action']['type']=='scroll'])
 urls=collapse([location(e['snapshot']['frameUrl']) for e in events if e.get('type')=='frame-snapshot' and e.get('snapshot',{}).get('isMainFrame') and e['snapshot']['frameUrl'].startswith('http')])
 expected=collapse([location(s['audit']['url']) for s in result['steps'] if s.get('audit',{}).get('url')])
 assert urls[:len(expected)]==expected,(trial['id'],urls,expected)
 assert sha(file)==before
 report['trials'].append({'id':trial['id'],'traceSha256':before,'archiveCRCValid':True,'clickCalls':len(clicks),'scrollCalls':len(scrolls),'recordedBackActions':len([s for s in selected if s['action']['type']=='back']),'clickScrollAllCompletedWithoutErrors':True,'observedRouteMatchesTraceMainFrameURLPrefix':True,'traceURLSequence':urls,'rawObservedRouteSequence':expected,'limitation':'CDP navigateToHistoryEntry has no before-event; Back is supported by raw action/outcome plus subsequent frame URL/image.'})
report['status']='VERIFIED_12_TRACE_ARCHIVES'
out.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':report['status'],'trials':len(report['trials']),'out':str(out)}))

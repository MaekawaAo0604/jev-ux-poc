import json,zipfile,hashlib,pathlib,sys
from urllib.parse import urlsplit
root=pathlib.Path(sys.argv[1] if len(sys.argv)>1 else 'reports/notification-switch-2026-10-29/live')
out=pathlib.Path(sys.argv[2] if len(sys.argv)>2 else 'reports/notification-switch-2026-10-29/independent-live-1793212068247')
read=lambda p:json.loads(pathlib.Path(p).read_text(encoding='utf-8-sig'))
sha=lambda p:hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()
audit=read(out/'audit.json')
report={'status':'RUNNING','readOnly':True,'failures':[],'trials':[]}
def location(url):
 u=urlsplit(url)
 assert u.hostname in ['127.0.0.1','localhost']
 return u.path+('?' + u.query if u.query else '')+('#'+u.fragment if u.fragment else '')
def collapse(items):
 result=[]
 for item in items:
  if not result or result[-1]!=item:result.append(item)
 return result
try:
 for trial in audit['trials']:
  file=root/trial['dir']/'exploration'/'trace.zip'
  before=sha(file)
  with zipfile.ZipFile(file) as z:
   assert z.testzip() is None
   names=z.namelist()
   events=[json.loads(line) for name in names if name.endswith('.trace') for line in z.read(name).decode().splitlines()]
  after={e['callId']:e for e in events if e.get('type')=='after'}
  clicks=[e for e in events if e.get('type')=='before' and e.get('method')=='click' and e.get('class') in ['ElementHandle','Frame']]
  scrolls=[e for e in events if e.get('type')=='before' and e.get('method')=='evaluateExpression' and 'window.scrollBy' in e.get('params',{}).get('expression','') and len(e['params']['expression'])<1000]
  for event in clicks+scrolls:
   assert event['callId'] in after
   assert 'error' not in after[event['callId']]
  selected=[s for s in trial['selections'] if s['actualOutcome']=='UI_PERFORMED']
  assert len(clicks)==len([s for s in selected if s['actualAction']['type']=='click'])
  assert len(scrolls)==len([s for s in selected if s['actualAction']['type']=='scroll'])
  urls=collapse([location(e['snapshot']['frameUrl']) for e in events if e.get('type')=='frame-snapshot' and e.get('snapshot',{}).get('isMainFrame') and e['snapshot']['frameUrl'].startswith('http')])
  expected=collapse([r['url'] for r in trial['route']])
  assert urls[:len(expected)]==expected,(trial['id'],urls,expected)
  assert sha(file)==before
  report['trials'].append({'id':trial['id'],'traceSha256':before,'archiveCRCValid':True,'clickCalls':len(clicks),'scrollCalls':len(scrolls),'recordedBackActions':len([s for s in selected if s['actualAction']['type']=='back']),'clickScrollAllCompletedWithoutErrors':True,'observedRouteMatchesTraceMainFrameURLPrefix':True,'traceURLSequence':urls,'rawObservedRouteSequence':expected,'limitation':'CDP navigateToHistoryEntry calls are not recorded as before-events in this trace; Back is supported by the raw action/outcome and subsequent independent frame URL/image, not a separately recorded CDP command.'})
 hashes=read(out/'original-hashes-before.json')
 changed=[p for p,h in hashes.items() if sha(p)!=h]
 report['allOriginalRawFinalHashCheck']={'files':len(hashes),'changed':changed,'unchanged':not changed}
 assert not changed
 report['status']='VERIFIED_12_TRACE_ARCHIVES'
except Exception as error:
 import traceback
 report['status']='FAILED'
 report['failures'].append({'message':str(error),'stack':traceback.format_exc()})
(out/'trace-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'status':report['status'],'trials':len(report['trials']),'failures':report['failures'],'finalRawCheck':report.get('allOriginalRawFinalHashCheck')},ensure_ascii=False))
if report['status']=='FAILED':sys.exit(1)

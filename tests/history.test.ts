import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rememberObservation} from '../jev/history.js';
import {explorationProgress} from '../jev/progress.js';
import type {Observation,State,TextRegion} from '../jev/types.js';

const screen:Observation={title:'Conditions',text:['Condition A','Age 15–18'],elements:[],canScrollUp:false,canScrollDown:true};
test('history retains the exact observed body across screens without mutating recorded states',()=>{
 const first=rememberObservation([],screen,'Scroll','Next screen');
 const saved=structuredClone(first);
 const next=rememberObservation(first,{...screen,text:['Condition B','Staffed hours only']},'Scroll','Next screen');
 assert.deepEqual(next.map(entry=>entry.observedText),[['Condition A','Age 15–18'],['Condition B','Staffed hours only']]);
 assert.deepEqual(first,saved);
 screen.text[0]='Changed later';assert.equal(first[0].observedText?.[0],'Condition A');screen.text[0]='Condition A';
});

test('history retains all older observed facts beyond twenty thousand characters',()=>{
 const oldText=Array.from({length:30},(_,i)=>`${i}:`+'x'.repeat(999));
 const old=rememberObservation([],{...screen,text:oldText},'Scroll','Next');
 const next=rememberObservation(old,{...screen,text:['Current conditions','Final entrance: 16:30']},'Scroll','Next');
 assert.deepEqual(next.map(entry=>entry.observedText),[oldText,['Current conditions','Final entrance: 16:30']]);
 assert.ok(next.every(entry=>!entry.observationOmitted));
 old[0].observedText![0]='Changed later';
 assert.equal(next[0].observedText?.[0],oldText[0]);
});

test('historical fragments retain observation warnings instead of becoming unqualified facts',()=>{
 const clipped={...screen,text:['50'],warnings:['PARTIAL_TEXT']};
 const first=rememberObservation([],clipped,'Scroll','Next');
 const next=rememberObservation(first,{...screen,text:['Other content']},'Scroll','Next');
 assert.deepEqual((next[0] as any).observedWarnings,['PARTIAL_TEXT']);
 clipped.warnings[0]='Changed later';assert.deepEqual((first[0] as any).observedWarnings,['PARTIAL_TEXT']);
});

test('history immutably retains matching region provenance, warnings and page metadata',()=>{
 const regions:TextRegion[]=[
  {id:'t0',source:'dom',text:'Conditions',bbox:{x0:0,y0:0,x1:100,y1:20},context:{landmark:'main',section:'s1',headings:['Conditions']}},
  {id:'t1',source:'dom',text:'Condition A',bbox:{x0:0,y0:30,x1:100,y1:50},context:{landmark:'main',section:'s1',headings:['Conditions']}},
  {id:'t2',source:'dom',text:'Age 15–18',bbox:{x0:0,y0:60,x1:100,y1:80},context:{landmark:'main',section:'s1',headings:['Conditions']}},
 ];
 const contextual:Observation={...screen,text:['Conditions','Condition A','Age 15–18'],regions,warnings:['PARTIAL_TEXT'],pageId:'p1',viewport:{top:0,bottom:600,height:600}};
 const remembered=rememberObservation([],contextual,'Scroll','Next screen');

 assert.deepEqual(remembered,[{
  screen:'Conditions',action:'Scroll',result:'Next screen',observedText:['Conditions','Condition A','Age 15–18'],
  observedWarnings:['PARTIAL_TEXT'],observedRegions:regions,pageId:'p1',viewport:{top:0,bottom:600,height:600},
 }]);
 contextual.regions![1].text='Changed later';
 contextual.regions![1].context!.headings[0]='Changed heading';
 contextual.viewport!.top=99;
 assert.equal(remembered[0].observedRegions?.[1].text,'Condition A');
 assert.deepEqual(remembered[0].observedRegions?.[1].context?.headings,['Conditions']);
 assert.equal(remembered[0].viewport?.top,0);
});

test('history retains all older regions and copies their context independently of previous states',()=>{
 const oldText=Array.from({length:21},(_,i)=>`${i}:`+'x'.repeat(999));
 const oldRegions:TextRegion[]=oldText.map((text,i)=>({id:`t${i}`,source:'dom',text,bbox:{x0:0,y0:i,x1:10,y1:i+1},context:{landmark:'main',section:`s${i}`,headings:[`Heading ${i}`]}}));
 const old=rememberObservation([],{...screen,text:oldText,regions:oldRegions,pageId:'p1'},'Scroll','Next');
 const next=rememberObservation(old,{...screen,text:['Current conditions'],regions:[{id:'t1',source:'dom',text:'Current conditions',bbox:{x0:0,y0:0,x1:10,y1:10}}],pageId:'p2'},'Open','Opened');
 assert.deepEqual(next[0].observedText,oldText);
 assert.deepEqual(next[0].observedRegions,oldRegions);
 old[0].observedRegions![20].context!.headings[0]='Changed heading';
 old[0].observedRegions![20].bbox.y0=999;
 assert.deepEqual(next[0].observedRegions?.[20].context?.headings,['Heading 20']);
 assert.equal(next[0].observedRegions?.[20].bbox.y0,20);
});

test('history retains late observed headings and their relation to earlier facts',()=>{
 const fact='Visible fact',filler='x'.repeat(19_980),heading='Observed heading';
 const remembered=rememberObservation([],{
  ...screen,text:[fact,filler,heading],
  regions:[{id:'t1',source:'dom',text:fact,bbox:{x0:0,y0:0,x1:10,y1:10},context:{landmark:'main',section:'s1',headings:[heading]}}],
 },'Scroll','Next');
 assert.ok(remembered[0].observedText?.includes(fact));
 assert.ok(remembered[0].observedText?.includes(heading));
 assert.deepEqual(remembered[0].observedRegions?.[0].context?.headings,[heading]);
});

test('history preserves preexisting omission flags and warning copies',()=>{
 const historical:State['history']=[{screen:'Older observation',action:'Scroll',result:'Next',observedText:['Retained fragment'],observationOmitted:true,observedWarnings:['PARTIAL_TEXT'],remainingGoalChecks:['Check condition'],viewport:{top:0,bottom:600,height:600}}];
 const next=rememberObservation(historical,screen,'Scroll','Next');
 assert.equal(next[0].observationOmitted,true);
 historical[0].observedWarnings![0]='Changed warning';
 historical[0].remainingGoalChecks![0]='Changed check';
 historical[0].viewport!.top=100;
 assert.deepEqual(next[0].observedWarnings,['PARTIAL_TEXT']);
 assert.deepEqual(next[0].remainingGoalChecks,['Check condition']);
 assert.equal(next[0].viewport?.top,0);
});

test('exploration progress distinguishes pages and includes only executed history actions',()=>{
 const state:State={
  goal:'Compare clubs',currentDate:'2026-09-21',
  history:[
   {screen:'Directory',action:'Open students',result:'Opened',pageId:'p1',viewport:{top:0,bottom:400,height:400},remainingGoalChecks:['student access']},
   {screen:'Students',action:'Back',result:'Returned',pageId:'p2',viewport:{top:400,bottom:800,height:400}},
  ],
  screen:{title:'Directory',text:['Members'],elements:[],canScrollUp:false,canScrollDown:true,pageId:'p1',viewport:{top:400,bottom:800,height:400}},
 };

 assert.deepEqual(explorationProgress(state),{
  currentPage:'p1',visibleRange:{top:400,bottom:800,height:400},
  pages:[
   {pageId:'p1',ranges:[{top:0,bottom:400,height:400},{top:400,bottom:800,height:400}],actions:[{step:1,label:'Open students',result:'Opened',remainingGoalChecks:['student access']}]},
   {pageId:'p2',ranges:[{top:400,bottom:800,height:400}],actions:[{step:2,label:'Back',result:'Returned'}]},
  ],
 });
});

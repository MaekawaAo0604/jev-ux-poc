import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';
import {PNG} from 'pngjs';
import {imageToViewport,transformVision,visionCandidates} from '../jev/virtual-beta/vision.js';
import type {BetaCandidates,VisionConfig} from '../jev/virtual-beta/contracts.js';

const full:VisionConfig={mode:'full',clearWidth:4,clearHeight:4,blurRadius:1};
const crop:VisionConfig={...full,mode:'crop'};
const foveated:VisionConfig={...full,mode:'foveated',clearWidth:2,clearHeight:2};
function fixture(width=8,height=6):Buffer {
  const png=new PNG({width,height});
  for(let y=0;y<height;y++) for(let x=0;x<width;x++) {
    const i=(y*width+x)*4;
    png.data.set([(x+y)%2?255:0,x*20,y*30,255],i);
  }
  return PNG.sync.write(png);
}
function pixel(bytes:Buffer,x:number,y:number):number[] {
  const png=PNG.sync.read(bytes);
  return [...png.data.subarray((y*png.width+x)*4,(y*png.width+x)*4+4)];
}
const digest=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');

test('full vision preserves original PNG bytes, hashes, size and labels',()=>{
  const bytes=fixture();
  const original:BetaCandidates={'1':{action:{type:'click',elementId:'1'},label:'visible checkout text'}};
  const result=transformVision(bytes,full,{x:4,y:3},[{id:'1',x:0,y:0,width:8,height:6}]);
  assert.deepEqual(result.bytes,bytes);
  assert.equal(result.sourceSha256,digest(bytes));
  assert.equal(result.imageSha256,digest(bytes));
  assert.deepEqual([result.width,result.height,result.sourceWidth,result.sourceHeight],[8,6,8,6]);
  assert.deepEqual(result.clearRect,{x:0,y:0,width:8,height:6});
  assert.deepEqual(imageToViewport({x:7,y:5},result),{x:7,y:5});
  assert.deepEqual(visionCandidates(original,result),original);
});

test('crop contains only clear-region pixels and maps delivered coordinates to viewport',()=>{
  const bytes=fixture();
  const result=transformVision(bytes,crop,{x:4,y:3},[
    {id:'1',x:2,y:1,width:4,height:4},
    {id:'2',x:1,y:1,width:2,height:1},
    {id:'3',x:6,y:1,width:1,height:1},
  ]);
  assert.deepEqual(result.clearRect,{x:2,y:1,width:4,height:4});
  assert.deepEqual([result.width,result.height],[4,4]);
  assert.deepEqual(result.transform,{offsetX:2,offsetY:1,scaleX:1,scaleY:1});
  assert.deepEqual(imageToViewport({x:0,y:0},result),{x:2,y:1});
  assert.deepEqual(imageToViewport({x:3.5,y:3.5},result),{x:5.5,y:4.5});
  assert.deepEqual(pixel(result.bytes,0,0),[255,40,30,255]);
  assert.deepEqual(pixel(result.bytes,3,3),pixel(bytes,5,4));
  assert.equal(result.sourceSha256,digest(bytes));
  assert.equal(result.imageSha256,digest(result.bytes));
  assert.notEqual(result.imageSha256,result.sourceSha256);
  assert.deepEqual(result.visibleTargets,[{id:'1',x:2,y:1,width:4,height:4}]);
});

test('edge crop intersects the fixation-centered region without shifting fixation',()=>{
  const bytes=fixture();
  const topLeft=transformVision(bytes,crop,{x:0,y:0},[]);
  assert.deepEqual(topLeft.clearRect,{x:0,y:0,width:2,height:2});
  assert.deepEqual([topLeft.width,topLeft.height],[2,2]);
  const bottomRight=transformVision(bytes,crop,{x:7,y:5},[]);
  assert.deepEqual(bottomRight.clearRect,{x:5,y:3,width:3,height:3});
  assert.deepEqual(imageToViewport({x:2,y:2},bottomRight),{x:7,y:5});
  assert.deepEqual(bottomRight.fixation,{x:7,y:5});
});

test('odd and oversized clear regions use bounded integer pixel rectangles',()=>{
  const bytes=fixture();
  const odd=transformVision(bytes,{...crop,clearWidth:3,clearHeight:3},{x:4.7,y:3.2},[]);
  assert.deepEqual(odd.clearRect,{x:3,y:2,width:3,height:3});
  const large=transformVision(bytes,{...crop,clearWidth:20,clearHeight:20},{x:4,y:3},[]);
  assert.deepEqual(large.clearRect,{x:0,y:0,width:8,height:6});
});

test('foveated PNG applies a deterministic box blur outside a sharp clear region',()=>{
  const bytes=fixture();
  const result=transformVision(bytes,foveated,{x:4,y:3},[
    {id:'1',x:3,y:2,width:2,height:2},
    {id:'2',x:2,y:2,width:2,height:2},
  ]);
  assert.deepEqual(result.clearRect,{x:3,y:2,width:2,height:2});
  assert.deepEqual([result.width,result.height],[8,6]);
  assert.deepEqual(pixel(result.bytes,3,2),[255,60,60,255]);
  // At a corner radius=1 clips the 3x3 kernel to four in-bounds pixels.
  assert.deepEqual(pixel(result.bytes,0,0),[128,10,15,255]);
  // Interior checkerboard has four white and five black neighbors.
  assert.deepEqual(pixel(result.bytes,1,1),[113,20,30,255]);
  assert.notEqual(result.imageSha256,result.sourceSha256);
  assert.deepEqual(result.bytes,transformVision(bytes,foveated,{x:4,y:3},[]).bytes);
  assert.deepEqual(imageToViewport({x:6,y:5},result),{x:6,y:5});
  assert.deepEqual(result.visibleTargets,[{id:'1',x:3,y:2,width:2,height:2}]);
  assert.deepEqual(pixel(bytes,0,0),[0,0,0,255]);
});

test('constrained candidates remove hidden or partial controls and all supplied labels',()=>{
  const original:BetaCandidates={
    '1':{action:{type:'click',elementId:'1'},label:'SECRET_VISIBLE_DOM_TEXT'},
    '2':{action:{type:'click',elementId:'2'},label:'SECRET_HIDDEN_DOM_TEXT'},
    '3':{action:{type:'click',elementId:'3'},label:'SECRET_PARTIAL_DOM_TEXT'},
    done:{action:{type:'done'},label:'SECRET_EXTRA_DOM_TEXT'},
    scroll_down:{action:{type:'scroll',direction:'down'},label:'SECRET_SCROLL_TEXT'},
    look_1:{action:{type:'look',point:{x:7,y:5}},label:'SECRET_LOOK_TEXT'},
  };
  for(const mode of ['crop','foveated'] as const) {
    const observation=transformVision(fixture(),{...crop,mode},{x:4,y:3},[
      {id:'1',x:2,y:1,width:1,height:1},
      {id:'2',x:0,y:0,width:1,height:1},
      {id:'3',x:1,y:1,width:2,height:1},
    ]);
    const result=visionCandidates(original,observation);
    assert.deepEqual(Object.keys(result),['1','done','scroll_down','look_1']);
    assert.equal(result['1'].label,'[1]');
    assert.equal(JSON.stringify(result).includes('SECRET'),false);
    assert.deepEqual(result['1'].action,{type:'click',elementId:'1'});
  }
});

test('constrained metadata strips runtime extras and excludes nonnumeric target IDs',()=>{
  const target={id:'1',x:2,y:1,width:1,height:1,label:'SECRET_ATTR',text:'SECRET_TEXT'};
  const result=transformVision(fixture(),crop,{x:4,y:3},[target]);
  assert.deepEqual(result.visibleTargets,[{id:'1',x:2,y:1,width:1,height:1}]);
  assert.equal(JSON.stringify(result.visibleTargets).includes('SECRET'),false);
  assert.throws(()=>transformVision(fixture(),crop,{x:4,y:3},[{...target,id:'secret-dom-id'}]),/target.*id/i);
});

test('constrained candidates cannot smuggle semantic keys or action extras',()=>{
  const observation=transformVision(fixture(),crop,{x:4,y:3},[{id:'1',x:2,y:1,width:1,height:1}]);
  const original:BetaCandidates={
    secretKey:{action:{type:'click',elementId:'1'},label:'secret'},
    '1':{action:{type:'click',elementId:'1',secret:'leak'} as never,label:'secret'},
  };
  const result=visionCandidates(original,observation);
  assert.deepEqual(result,{'1':{action:{type:'click',elementId:'1'},label:'[1]'}});
});

test('image coordinate conversion rejects outside, nonfinite, or malformed transforms',()=>{
  const result=transformVision(fixture(),crop,{x:4,y:3},[]);
  for(const point of [{x:-1,y:0},{x:4,y:0},{x:0,y:4},{x:NaN,y:0},{x:0,y:Infinity}])
    assert.throws(()=>imageToViewport(point,result),/point|coordinate/i);
  assert.throws(()=>imageToViewport({x:0,y:0},{...result,transform:{...result.transform,scaleX:0}}),/transform/i);
});

test('invalid configuration, fixation, PNG and target geometry fail closed',()=>{
  const bytes=fixture();
  const invalid:VisionConfig[]=[
    {...crop,clearWidth:0},{...crop,clearHeight:-1},{...crop,clearWidth:1.5},
    {...crop,clearWidth:Infinity},{...crop,blurRadius:-1},{...crop,blurRadius:1.5},
    {...foveated,blurRadius:0},{...crop,mode:'unknown'} as never,
  ];
  for(const config of invalid) assert.throws(()=>transformVision(bytes,config,{x:4,y:3},[]),/vision|clear|blur|mode/i);
  for(const point of [{x:-1,y:0},{x:8,y:0},{x:0,y:6},{x:NaN,y:0},{x:0,y:Infinity}])
    assert.throws(()=>transformVision(bytes,crop,point,[]),/fixation/i);
  for(const target of [{id:'1',x:NaN,y:0,width:1,height:1},{id:'1',x:0,y:0,width:0,height:1}])
    assert.throws(()=>transformVision(bytes,crop,{x:4,y:3},[target]),/target/i);
  assert.throws(()=>transformVision(bytes,crop,{x:4,y:3},[{id:'1',x:0,y:0,width:1,height:1},{id:'1',x:1,y:0,width:1,height:1}]),/target.*id/i);
  assert.throws(()=>transformVision(Buffer.from('not png'),crop,{x:0,y:0},[]));
});

test('targets partly outside viewport never become eligible even in full mode',()=>{
  const result=transformVision(fixture(),full,{x:4,y:3},[
    {id:'1',x:-1,y:0,width:2,height:1},{id:'2',x:7,y:5,width:2,height:1},
    {id:'3',x:0,y:0,width:8,height:6},
  ]);
  assert.deepEqual(result.visibleTargets,[{id:'3',x:0,y:0,width:8,height:6}]);
});

test('eN target IDs retain click mapping with exact anonymous screenshot markers',()=>{
  const observation=transformVision(fixture(),crop,{x:4,y:3},[{id:'e12',x:2,y:1,width:1,height:1}]);
  assert.deepEqual(visionCandidates({e12:{action:{type:'click',elementId:'e12'},label:'SECRET'}},observation),
    {e12:{action:{type:'click',elementId:'e12'},label:'[e12]'}});
});

test('constrained non-click candidate keys cannot carry arbitrary source text',()=>{
  const observation=transformVision(fixture(),crop,{x:4,y:3},[]);
  const original:BetaCandidates={
    SECRET_PAGE_TITLE:{action:{type:'done'},label:'SECRET'},
    SECRET_ATTRIBUTE:{action:{type:'look',point:{x:0,y:0}},label:'SECRET'},
    back:{action:{type:'back'},label:'SECRET'},
    look_0_0:{action:{type:'look',point:{x:0,y:0}},label:'SECRET'},
  };
  assert.deepEqual(Object.keys(visionCandidates(original,observation)),['back','look_0_0']);
});


test('constrained targets require both control and badge fully inside clear region',()=>{
  const targets=[
    {id:'e1',x:2,y:1,width:1,height:1,badge:{x:3,y:1,width:1,height:1}},
    {id:'e2',x:2,y:2,width:1,height:1,badge:{x:1,y:2,width:1,height:1}},
    {id:'e3',x:4,y:2,width:1,height:1,badge:{x:5,y:2,width:2,height:1}},
  ];
  for(const mode of ['crop','foveated'] as const) {
    const observation=transformVision(fixture(),{...crop,mode},{x:4,y:3},targets);
    assert.deepEqual(observation.visibleTargets,[targets[0]]);
    const offered:BetaCandidates={
      e1:{action:{type:'click',elementId:'e1'},label:'SECRET_VISIBLE'},
      e2:{action:{type:'click',elementId:'e2'},label:'SECRET_BADGE_OUTSIDE'},
      e3:{action:{type:'click',elementId:'e3'},label:'SECRET_BADGE_PARTIAL'},
    };
    assert.deepEqual(visionCandidates(offered,observation),{e1:{action:{type:'click',elementId:'e1'},label:'[e1]'}});
  }
  const fullObservation=transformVision(fixture(),full,{x:4,y:3},targets);
  assert.deepEqual(fullObservation.visibleTargets,targets);
});

test('badge metadata strips semantic runtime extras and rejects invalid geometry',()=>{
  const target={id:'e1',x:2,y:1,width:1,height:1,
    badge:{x:3,y:1,width:1,height:1,text:'SECRET_BADGE_TEXT',attrs:{title:'SECRET_TITLE'}},
    text:'SECRET_CONTROL_TEXT',connector:{label:'SECRET_CONNECTOR'}};
  const observation=transformVision(fixture(),crop,{x:4,y:3},[target]);
  assert.deepEqual(observation.visibleTargets,[{id:'e1',x:2,y:1,width:1,height:1,badge:{x:3,y:1,width:1,height:1}}]);
  assert.equal(JSON.stringify(observation.visibleTargets).includes('SECRET'),false);
  for(const badge of [{x:NaN,y:1,width:1,height:1},{x:3,y:1,width:0,height:1},{x:3,y:Infinity,width:1,height:1}])
    assert.throws(()=>transformVision(fixture(),crop,{x:4,y:3},[{...target,badge}]),/badge/i);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {transformVision} from '../jev/virtual-beta/vision.js';
import {modelInput} from '../runner/virtual-beta-core.js';
import {comparisonConfigs} from '../jev/virtual-beta/config.js';
import {createUserState} from '../jev/virtual-beta/user-state.js';
import {parseCharter} from '../jev/persona.js';
import {readFileSync} from 'node:fs';
const charter=parseCharter(JSON.parse(readFileSync('experiments/persona/charter-semantic.json','utf8')));
const bytes=PNG.sync.write(new PNG({width:1280,height:900}));
test('model observation keeps original viewport bounds distinct from actual cropped PNG dimensions',()=>{
 for(const fixation of [{x:640,y:450},{x:960,y:675}]){
  const config=comparisonConfigs(1,'crop')[3];config.vision.clearWidth=640;config.vision.clearHeight=480;
  const vision=transformVision(bytes,config.vision,fixation,[]),observation={id:'o1',imageSha256:vision.imageSha256,visibleText:[],fixation,candidateIds:[]};
  const wire=modelInput({charter},vision,observation,createUserState(undefined,fixation),config,{title:'',text:[],elements:[],canScrollUp:false,canScrollDown:false},[]) as any;
  assert.deepEqual(wire.observation.viewport,{width:1280,height:900});assert.equal(wire.observation.width,640);assert.equal(wire.observation.height,fixation.y===450?480:465);assert.deepEqual(wire.observation.fixation,fixation);assert.deepEqual(wire.observation.transform,{offsetX:fixation.x-320,offsetY:fixation.y-240,scaleX:1,scaleY:1});assert.equal(wire.observation.screen,undefined);
  assert.ok(960>=wire.observation.width&&960<wire.observation.viewport.width,'Right look point outside crop is within source viewport');
 }
});

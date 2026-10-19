import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PNG} from 'pngjs';
import {visualDetail} from '../runner/visual-detail.js';

test('a detail image enlarges only the selected current pixels and maps original coordinates exactly',()=>{
 const source=new PNG({width:1440,height:1000});
 for(let y=0;y<1000;y++)for(let x=0;x<1440;x++){const i=(y*1440+x)*4;source.data.set([x%251,y%251,100,255],i);}
 const bytes=PNG.sync.write(source),before=Buffer.from(bytes);
 const detail=visualDetail(bytes,[{x0:100,y0:700,x1:500,y1:740}]);
 assert.deepEqual(detail.rect,{x:76,y:676,width:448,height:94});
 const png=PNG.sync.read(detail.bytes);assert.equal(png.width,1344);assert.equal(png.height,282);
 assert.deepEqual([...png.data.subarray((50*1344+100)*4,(50*1344+100)*4+4)],[109,190,100,255]);
 assert.deepEqual(bytes,before,'source pixels and its saved hash must not change');
 const fractional=visualDetail(bytes,[{x0:100,y0:700,x1:692,y1:740}]);
 const fractionalPng=PNG.sync.read(fractional.bytes);
 assert.deepEqual(fractional.rect,{x:76,y:676,width:640,height:115});
 for(let y=0;y<fractionalPng.height;y++)for(let x=0;x<fractionalPng.width;x++){
  const sourceX=76+Math.floor(x*640/fractionalPng.width);
  const sourceY=676+Math.floor(y*115/fractionalPng.height);
  const index=(y*fractionalPng.width+x)*4;
  assert.deepEqual([...fractionalPng.data.subarray(index,index+4)],[sourceX%251,sourceY%251,100,255],`fractional detail pixel ${x},${y}`);
 }
 const edge=visualDetail(bytes,[{x0:1400,y0:970,x1:1435,y1:990}]);
 assert.deepEqual(edge.rect,{x:1346,y:906,width:94,height:94});
 const edgePng=PNG.sync.read(edge.bytes);assert.equal(edgePng.width,282);assert.equal(edgePng.height,282);
 assert.throws(()=>visualDetail(bytes,[{x0:0,y0:0,x1:1500,y1:10}]));
 assert.throws(()=>visualDetail(bytes,[]));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicNavigation} from '../runner/public-navigation.js';
import {safeRequestFailure} from '../jev/client.js';

test('client redirect permission closes before later requests are fetched',async()=>{
 const fetched:string[]=[];
 const context={request:{get:async(url:string)=>{fetched.push(url);return {status:()=>200,dispose:async()=>{}};}}} as any;
 const navigation=publicNavigation(context,'https://example.org',{});
 await assert.rejects(navigation.follow('https://example.org/before'),/SAFETY_BOUNDARY/);
 await navigation.resolve('https://example.org/start');
 await navigation.follow('https://example.org/landing');
 await navigation.release();
 await assert.rejects(navigation.follow('https://example.org/late'),/SAFETY_BOUNDARY/);
 assert.deepEqual(fetched,['https://example.org/start','https://example.org/landing']);
});

test('failed explicit navigation cannot leave client redirect permission open',async()=>{
 const context={request:{get:async()=>({status:()=>200,dispose:async()=>{}})}} as any;
 const navigation=publicNavigation(context,'https://example.org',{});
 await assert.rejects(navigation.resolve('https://other.example/'),/SAFETY_BOUNDARY/);
 await assert.rejects(navigation.follow('https://example.org/late'),/SAFETY_BOUNDARY/);
});

test('a rejected client redirect closes permission and discards even its vetted final response',async()=>{
 const context={request:{get:async(url:string)=>({status:()=>url.endsWith('/mixed')?302:200,headers:()=>({location:'/landing'}),dispose:async()=>{}})}} as any;
 for(const target of ['https://other.example/','https://example.org/mixed']){
  const navigation=publicNavigation(context,'https://example.org',{});
  await navigation.resolve('https://example.org/start');
  await assert.rejects(navigation.follow(target),/SAFETY_BOUNDARY/);
  await assert.rejects(navigation.follow('https://example.org/late'),/SAFETY_BOUNDARY/);
  assert.equal(navigation.take('https://example.org/landing'),undefined);
  assert.equal(navigation.take('https://example.org/start'),undefined);
 }
});

test('closing the navigation window cannot be undone by an in-flight redirect response',async()=>{
 let finish!:(value:any)=>void;
 const response={status:()=>200,dispose:async()=>{}};
 const context={request:{get:async(url:string)=>url.endsWith('/late')?new Promise(resolve=>{finish=resolve;}):response}} as any;
 const navigation=publicNavigation(context,'https://example.org',{});
 await navigation.resolve('https://example.org/start');
 const pending=navigation.follow('https://example.org/late');
 await navigation.release();finish(response);
 await assert.rejects(pending,/SAFETY_BOUNDARY/);
 assert.equal(navigation.take('https://example.org/late'),undefined);
});

test('navigation failure retains a bounded cause category without leaking request details',async()=>{
 for(const [message,category] of [['getaddrinfo ENOTFOUND PRIVATE_HOST','DNS_ERROR'],['connect ECONNREFUSED PRIVATE','CONNECTION_REFUSED'],['certificate has expired PRIVATE','TLS_ERROR'],['Timeout 15000ms exceeded PRIVATE','TIMEOUT'],['connect EACCES PRIVATE','ACCESS_DENIED'],['Unexpected PRIVATE','UNKNOWN']]){
  const context={request:{get:async()=>{throw new Error(message);}}} as any;
  await assert.rejects(publicNavigation(context,'https://example.org',{}).resolve('https://example.org'),error=>{
   assert.ok(error instanceof Error);assert.match(error.message,new RegExp(category));assert.doesNotMatch(error.message,/PRIVATE/);return true;
  });
 }
});

test('gateway diagnostics keep only a recognized type, never headers, body or free-form types',()=>{
 const failure=safeRequestFailure({statusCode:503,type:'internal_server_error',message:'PRIVATE',cause:{responseBody:'PRIVATE',headers:{Authorization:'PRIVATE'}}});
 assert.deepEqual(failure,{code:'HTTP_ERROR',statusCode:503,providerType:'internal_server_error'});
 assert.doesNotMatch(JSON.stringify(safeRequestFailure({statusCode:500,type:'PRIVATE'})),/PRIVATE/);
});

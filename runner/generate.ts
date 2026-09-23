import {readFile} from 'node:fs/promises';
import {saveRawTest} from './generate-test.js';

const args=process.argv.slice(2);
if(args.length!==1||args[0]==='--help'){
 console.log('Usage: npm run generate:test -- path/to/action-trace.json\nWrites immutable raw files under generated/raw. MVP: verified local notifications goal only.');
 if(args[0]!=='--help')process.exitCode=1;
}else{
 try{console.log(JSON.stringify(await saveRawTest(JSON.parse(await readFile(args[0],'utf8')))));}
 catch(e){console.error(e instanceof Error?e.message:String(e));process.exitCode=1;}
}

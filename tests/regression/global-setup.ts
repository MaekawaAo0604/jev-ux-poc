import {createServer} from 'vite';

// Same lifecycle as browser.test.ts: explicitly close Vite instead of relying
// on shell process-tree termination, which can be restricted on Windows.
export default async function setup(){
 const server=await createServer({server:{host:'127.0.0.1',port:5188,strictPort:true},logLevel:'error'});
 try{await server.listen();}catch(error){await server.close();throw error;}
 return async()=>{await server.close();};
}

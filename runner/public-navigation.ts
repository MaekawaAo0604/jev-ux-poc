import type {APIResponse,BrowserContext} from 'playwright';

// Match known transport signatures, but never persist arbitrary messages/URLs.
export function navigationFailureCategory(error:unknown){
 const e=error as {message?:unknown;code?:unknown;name?:unknown}|null;
 const signature=[e?.code,e?.name,e?.message].filter(v=>typeof v==='string').join(' ');
 if(/ENOTFOUND|EAI_AGAIN|ERR_NAME_NOT_RESOLVED/i.test(signature))return 'DNS_ERROR';
 if(/ECONNREFUSED|ERR_CONNECTION_REFUSED/i.test(signature))return 'CONNECTION_REFUSED';
 if(/certificate|CERT_|SSL_|TLS_/i.test(signature))return 'TLS_ERROR';
 if(/Timeout|ETIMEDOUT|ERR_TIMED_OUT/i.test(signature))return 'TIMEOUT';
 if(/EACCES|EPERM|ERR_ACCESS_DENIED/i.test(signature))return 'ACCESS_DENIED';
 if(/ECONNRESET|ERR_CONNECTION_RESET/i.test(signature))return 'CONNECTION_RESET';
 return 'UNKNOWN';
}

/** Inspect every redirect before contacting it, then reuse the final response.
 * Browser redirect chains can bypass Playwright routes, so do not let the
 * browser follow them. Navigate once to the vetted final URL with cached HTML.
 */
export function publicNavigation(context:BrowserContext,origin:string,headers:Record<string,string>){
 const prepared=new Map<string,APIResponse>();
 let clientWindow=false,clientHops=0,generation=0;
 const release=async()=>{
  clientWindow=false;generation++;
  const responses=[...prepared.values()];prepared.clear();await Promise.all(responses.map(r=>r.dispose()));
 };
 const resolveDocument=async(input:string,expectedGeneration:number)=>{
   let current=input;const visited=new Set<string>();
   for(let hop=0;hop<=3;hop++){
    if(!clientWindow||generation!==expectedGeneration)throw new Error('SAFETY_BOUNDARY: navigation window closed');
    const url=new URL(current),fragment=url.hash;url.hash='';
    if(!['http:','https:'].includes(url.protocol)||url.origin!==origin||url.username||url.password)throw new Error('SAFETY_BOUNDARY: redirect outside permitted origin');
    if(/\.(pdf|zip|exe|docx?|xlsx?)$/i.test(url.pathname))throw new Error('UNSUPPORTED_CONTENT: file navigation');
    if(visited.has(url.href))throw new Error('SAFETY_BOUNDARY: redirect loop');
    visited.add(url.href);
    let response:APIResponse;
    try{response=await context.request.get(url.href,{maxRedirects:0,timeout:15000,headers});}
    catch(error){throw new Error(`PAGE_ERROR: navigation request failed (${navigationFailureCategory(error)})`);}
    if(!clientWindow||generation!==expectedGeneration){await response.dispose();throw new Error('SAFETY_BOUNDARY: navigation window closed');}
    if(response.status()>=300&&response.status()<400){
     const location=response.headers().location;await response.dispose();
     if(!location||hop===3)throw new Error('SAFETY_BOUNDARY: redirect limit or missing destination');
     try{const target=new URL(location,url);if(!location.includes('#'))target.hash=fragment;current=target.href;}
     catch{throw new Error('SAFETY_BOUNDARY: invalid redirect destination');}
     continue;
    }
    const previous=prepared.get(url.href);if(previous)await previous.dispose();
    if(!clientWindow||generation!==expectedGeneration){await response.dispose();throw new Error('SAFETY_BOUNDARY: navigation window closed');}
    prepared.set(url.href,response);
    // Preserve an explicit fragment while allowing the fetched document to be
    // fulfilled at its canonical URL. References and relative assets stay valid.
    return current;
   }
   throw new Error('SAFETY_BOUNDARY: redirect limit');
  };
 return {
  async resolve(input:string){
   await release();clientWindow=true;clientHops=0;const currentGeneration=generation;
   try{return await resolveDocument(input,currentGeneration);}
   catch(error){if(generation===currentGeneration)await release();throw error;}
  },
  async follow(input:string){
   const currentGeneration=generation;
   try{
    if(!clientWindow||clientHops>=3)throw new Error('SAFETY_BOUNDARY: unsolicited navigation or client redirect limit');
    clientHops++;
    const destination=await resolveDocument(input,currentGeneration);
    // Do not hand a redirect response to Chromium: subsequent HTTP hops can
    // bypass routing. Mixed client/HTTP redirect chains currently fail closed.
    const before=new URL(input),after=new URL(destination);before.hash='';after.hash='';
    if(before.href!==after.href)throw new Error('SAFETY_BOUNDARY: mixed client and HTTP redirect chain');
   }catch(error){if(generation===currentGeneration)await release();throw error;}
  },
  take(url:string){if(!clientWindow)return;const key=new URL(url);key.hash='';const response=prepared.get(key.href);prepared.delete(key.href);return response;},
  release
 };
}

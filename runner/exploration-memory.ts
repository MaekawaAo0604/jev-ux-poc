import {createHash} from 'node:crypto';
import type {Candidate,Observation,ObservedAlternative} from '../jev/types.js';
import type {FrontierOffer} from '../jev/frontier-types.js';

type Exclusion='explored'|'transit-route'|'duplicate';
type Edge={destination?:string};
type Node={id:string;documentUrl:string;available:Map<string,Candidate['action']['type']>;edges:Map<string,Edge>;navigationKeys:Map<string,string>;screen:Observation;controls:Map<string,Candidate>};
export type ExplorationOffer={
 stateId:string;revision:number;candidates:Record<string,Candidate>;
 transitChoices:string[];exclusions:Record<string,Exclusion>;
};

/** Private execution memory: no URLs, locators or inferred answers go to Jev.
 * Nodes are observed semantic states, not an assertion that a URL is fully read.
 * Previously executed paths may be traversed toward known, untried operations.
 */
export class ExplorationMemory{
 private nodes=new Map<string,Node>();
 private navigations=new Map<string,Edge>();
 private revision=0;
 private current?:{node:Node;keys:Record<string,string>;offer:ExplorationOffer;backKey?:string};
 private pending?:{edge:Edge;back:boolean;source:string;previousBackKey?:string;expectedBackSource?:string};
 // Current native history identities map to the exact observed departure
 // state. They are never stored or traversed as reusable graph Back edges.
 private backSources=new Map<string,string>();
 private transitVisited?:Set<string>;
 private targetIds=new Map<string,string>();
 private committed?:{targetId:string;focus:string};
 private titles=new Map<string,string>();

 observe(url:string,screen:Observation,offered:Record<string,Candidate>,identities:Record<string,string>,navigationChoices:readonly string[]=[]):ExplorationOffer{
  const keys=Object.fromEntries(Object.entries(offered).map(([id,c])=>[id,identities[id]??JSON.stringify(c.action)]));
  const backId=Object.keys(offered).find(id=>offered[id].action.type==='back');
  const backKey=backId?identities[backId]:undefined;
  const documentUrl=new URL(url);documentUrl.hash='';
  // Do not confuse transient element IDs, font metrics or pixel boxes with a
  // new task state. Visible text, warnings, location and distinct controls stay.
  const controls=[...new Set(Object.entries(offered).filter(([,c])=>!['back','done','stuck'].includes(c.action.type)).map(([id,c])=>JSON.stringify([keys[id],c.label])))].sort();
  const fingerprint=createHash('sha256').update(JSON.stringify({url:documentUrl.href,text:screen.text,warnings:screen.warnings??[],viewport:screen.viewport,canScrollUp:screen.canScrollUp,canScrollDown:screen.canScrollDown,controls})).digest('hex');
  let node=this.nodes.get(fingerprint);
  if(!node){node={id:`s${this.nodes.size+1}`,documentUrl:documentUrl.href,available:new Map(),edges:new Map(),navigationKeys:new Map(),screen,controls:new Map()};this.nodes.set(fingerprint,node);this.revision++;}
  // Inference recovery may reobserve a changed screen without any execution.
  if(!this.pending&&this.current&&this.current.node!==node){this.transitVisited=undefined;this.committed=undefined;}
  if(screen.title)this.titles.set(documentUrl.href,screen.title);
  node.screen={...screen,title:screen.title||this.titles.get(documentUrl.href)||''};
  node.controls=new Map(Object.entries(offered).map(([id,c])=>[keys[id],c]));
  node.available=new Map(Object.entries(offered).filter(([,c])=>!['done','stuck'].includes(c.action.type)).map(([id,c])=>[keys[id],c.action.type]));
  // PublicSitePage supplies only new-document links, resolved to absolute hrefs
  // and executed with a guarded GET. A shared header link is therefore
  // one known destination, not fresh exploration on each referring document.
  // Keep query/hash in the private key. Scroll/disclosure and same-document
  // fragment transitions stay state-local.
  node.navigationKeys=new Map(navigationChoices.filter(id=>offered[id]?.action.type==='click').map(id=>[keys[id],keys[id]]));
  if(this.pending){
   const {edge,back,source,previousBackKey,expectedBackSource}=this.pending;
   if(!back&&backKey&&backKey!==previousBackKey)this.backSources.set(backKey,source);
   if(back&&expectedBackSource!==node.id)this.committed=undefined;
   if(edge.destination!==node.id){
    // A changed destination invalidates the route we committed to following.
    this.transitVisited=undefined;
    if(!back||expectedBackSource!==node.id)this.committed=undefined;
    // New native back entries are traversal, not newly explored opportunities.
    if(!back&&edge.destination)this.revision++;
    // Plan from the latest actual outcome, not an obsolete successful route.
    edge.destination=node.id;
   }
   this.pending=undefined;
  }
  const candidates:Record<string,Candidate>={},exclusions:Record<string,Exclusion>={},transitChoices:string[]=[],seen=new Set<string>();
  for(const [id,candidate] of Object.entries(offered)){
   if(['done','stuck'].includes(candidate.action.type)){candidates[id]=candidate;continue;}
   const key=keys[id],edge=this.edgeFor(node,key);
   if(seen.has(key)){exclusions[id]='duplicate';continue;}seen.add(key);
   // Native Back depends on the current history stack. Keep it for ordinary
   // recovery, but never plan a future route using a past Back destination.
   if(candidate.action.type==='back'){
    if(this.transitVisited)exclusions[id]='transit-route';else candidates[id]=candidate;
    continue;
   }
   // Existing routes may pass unrelated fresh controls. Only the previously
   // traversed states are barred; Jev still chooses which frontier is useful.
   if(edge){
    if(!edge.destination||!this.hasFrontier(edge.destination,node.id)){exclusions[id]=this.transitVisited?'transit-route':'explored';continue;}
    transitChoices.push(id);
   }
   candidates[id]=candidate;
  }
  const offer={stateId:node.id,revision:this.revision,candidates,transitChoices,exclusions};
  this.current={node,keys,offer,backKey};return offer;
 }

 /** Call only after Playwright has actually completed this operation. */
 executed(offer:ExplorationOffer,choice:string){
  const current=this.current,candidate=offer.candidates[choice];
  if(!current||current.offer!==offer||!candidate||['done','stuck'].includes(candidate.action.type))throw new Error('Invalid executed exploration choice');
  const key=current.keys[choice];let edge=this.edgeFor(current.node,key);
  if(this.committed?.targetId===this.targetId(current.node,key))this.committed=undefined;
  const back=candidate.action.type==='back';
  if(!edge){
   edge={};const navigationKey=current.node.navigationKeys.get(key);
   if(navigationKey)this.navigations.set(navigationKey,edge);else current.node.edges.set(key,edge);
   if(!back){this.revision++;this.transitVisited=undefined;}
  }else if(!back)(this.transitVisited??=new Set()).add(current.node.id);
  this.pending={edge,back,source:current.node.id,previousBackKey:current.backKey,...(back?{expectedBackSource:this.backSources.get(key)}:{})};
 }

 /** Concrete untried operations reachable by already observed forward edges.
  * BFS chooses the shortest known route; it never guesses an unvisited URL.
  * Only the currently offered native Back may use its observed departure
  * state. A past Back destination never becomes a stable future graph edge.
  */
 frontier(offer:ExplorationOffer):FrontierOffer{
  const current=this.current;
  if(!current||current.offer!==offer)throw new Error('Stale exploration offer');
  const targets:FrontierOffer['targets']={},byId=new Map([...this.nodes.values()].map(n=>[n.id,n]));
  const queue:{node:Node;first?:string;distance:number}[]=[{node:current.node,distance:0}],seen=new Set<string>();
  const backId=Object.keys(offer.candidates).find(id=>offer.candidates[id].action.type==='back');
  const backSource=current.backKey&&this.backSources.get(current.backKey),source=backSource&&byId.get(backSource);
  if(backId&&source)queue.push({node:source,first:backId,distance:1});
  for(let i=0;i<queue.length;i++){
   const {node,first,distance}=queue[i];if(seen.has(node.id))continue;seen.add(node.id);
   for(const [key,type] of node.available){
    if(type==='back')continue;
    const immediate=first??Object.keys(offer.candidates).find(id=>current.keys[id]===key);
    if(!immediate)continue;
    const edge=this.edgeFor(node,key);
    if(edge){const destination=edge.destination&&byId.get(edge.destination);if(destination)queue.push({node:destination,first:immediate,distance:distance+1});continue;}
    const candidate=node.controls.get(key);if(!candidate)continue;
    const id=this.targetId(node,key);if(targets[id])continue;
    const action=candidate.action;
    const element=action.type==='click'?node.screen.elements.find(e=>e.id===action.elementId):undefined;
    targets[id]={label:candidate.label,kind:type,pageTitle:node.screen.title,...(node.screen.pageId?{pageId:node.screen.pageId}:{}),...(node.screen.viewport?{viewport:{...node.screen.viewport}}:{}),...(action.type==='scroll'?{direction:action.direction}:{}),...(element?.context?{context:element.context}:{}),travelSteps:distance,nextChoice:immediate};
   }
  }
  if(this.committed&&!targets[this.committed.targetId])this.committed=undefined;
  return {targets,...(this.committed?{continuation:{...this.committed}}:{})};
 }

 /** Previously visible but unexecuted controls, not promises of a Back route.
  * The current history stack remains owned and checked by the browser POM. */
 observedAlternatives(offer:ExplorationOffer,backUrl?:string):ObservedAlternative[]{
  if(this.current?.offer!==offer)throw new Error('Stale exploration offer');
  const alternatives:ObservedAlternative[]=[],seen=new Set<string>();
  const destination=backUrl?new URL(backUrl):undefined;if(destination)destination.hash='';
  for(const node of this.nodes.values()){
   if(destination&&node.documentUrl!==destination.href)continue;
   if(node===this.current.node||node.screen.pageId&&node.screen.pageId===this.current.node.screen.pageId)continue;
   const controls:ObservedAlternative['controls']=[];
   for(const [key,kind] of node.available){
    if(kind!=='click'||this.edgeFor(node,key))continue;
    const candidate=node.controls.get(key);if(!candidate)continue;
    const identity=JSON.stringify([node.screen.pageId??node.id,key]);if(seen.has(identity))continue;seen.add(identity);
    const action=candidate.action,context=action.type==='click'?node.screen.elements.find(e=>e.id===action.elementId)?.context:undefined;
    controls.push({label:candidate.label,kind,...(context?{context:structuredClone(context)}:{})});
   }
   if(controls.length)alternatives.push({pageTitle:node.screen.title,...(node.screen.pageId?{pageId:node.screen.pageId}:{}),controls});
  }
  return alternatives;
 }

 commit(offer:ExplorationOffer,targetId:string,focus:string){
  if(!this.frontier(offer).targets[targetId])throw new Error('Unreachable frontier target');
  if(this.committed?.targetId!==targetId||this.committed.focus!==focus)this.transitVisited=undefined;
  this.committed={targetId,focus};
 }

 private targetId(node:Node,key:string){
  const identity=node.navigationKeys.get(key)??JSON.stringify([node.id,key]);
  let id=this.targetIds.get(identity);
  if(!id){id=`f${this.targetIds.size+1}`;this.targetIds.set(identity,id);}
  return id;
 }

 private edgeFor(node:Node,key:string){
  const navigationKey=node.navigationKeys.get(key);
  return navigationKey?this.navigations.get(navigationKey):node.edges.get(key);
 }

 private hasFrontier(start:string,origin:string):boolean{
  const byId=new Map([...this.nodes.values()].map(node=>[node.id,node])),seen=new Set([origin,...this.transitVisited??[]]),queue=[start];
  for(let i=0;i<queue.length;i++){
   const id=queue[i];if(seen.has(id))continue;seen.add(id);
   const node=byId.get(id);if(!node)continue;
   for(const [key,type] of node.available){
    if(type==='back')continue;
    const edge=this.edgeFor(node,key);
    if(!edge)return true;
    if(edge.destination)queue.push(edge.destination);
   }
  }
  return false;
 }
}

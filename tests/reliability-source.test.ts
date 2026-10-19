import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesVisualText} from '../runner/reliability-source.js';

test('typographic wave dashes are equivalent, not kana guesses, changed endpoints, missing negation or long-vowel substitutions',()=>{
 const bbox={x0:0,y0:0,x1:400,y1:40},facts=['サポート受付：平日10時〜17時','変更できません'];
 assert.equal(matchesVisualText('サ ポ ー ト 受 付 : 平 日 10 時 ~ 17 時',bbox,[],facts),true);
 for(const text of ['サポート受付：平日10時へ17時','サポート受付：平日10時〜19時','サポ-ト受付：平日10時〜17時','変更できます'])assert.equal(matchesVisualText(text,bbox,[],facts),false);
});
test('a rendered text row may contain adjacent controls, but not invented values or joins across rows',()=>{
 const probes=[
  {text:'ご利用案内',visible:true,bbox:{x0:0,y0:0,x1:100,y1:30}},
  {text:'サービス料金のご案内',visible:true,bbox:{x0:0,y0:50,x1:200,y1:90}},
  {text:'サポート受付のご案内',visible:true,bbox:{x0:220,y0:50,x1:430,y1:90}},
  {text:'料金99,999円',visible:false,bbox:{x0:450,y0:50,x1:600,y1:90}},
 ];
 assert.equal(matchesVisualText('サービス料金のご案内 サポート受付のご案内',{x0:2,y0:55,x1:425,y1:80},probes,[]),true);
 assert.equal(matchesVisualText('ご利用案内 サポート受付のご案内',{x0:0,y0:0,x1:430,y1:90},probes,[]),false);
 assert.equal(matchesVisualText('サポート受付のご案内 サービス料金のご案内',{x0:0,y0:50,x1:430,y1:90},probes,[]),false);
 assert.equal(matchesVisualText('料金99,999円',{x0:450,y0:50,x1:600,y1:90},probes,[]),false);
 assert.equal(matchesVisualText('月額料金 2200円',{x0:0,y0:50,x1:430,y1:90},probes,['月額料金 1200円']),false);
});

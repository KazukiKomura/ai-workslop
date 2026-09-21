import test from 'node:test';
import assert from 'node:assert/strict';
import {measurement, PROTOCOL_VERSION, LEGACY_V4, isV5, nextPhase, phaseList, splitPhase, blockFor, scoringNotes, CASES_PER_PARTICIPANT, SENDERS} from '../src/measurement.js';
import cases from '../src/cases.js';

test('v5 phase list: intro, three case loops, closing blocks',()=>{
  assert.equal(isV5(PROTOCOL_VERSION),true);assert.equal(isV5(LEGACY_V4),false);
  const l=phaseList();
  assert.equal(l[0],'intro');assert.equal(l[1],'materials_1');assert.equal(l.at(-1),'complete');
  assert.equal(l.filter(p=>p.startsWith('cognition_')).length,CASES_PER_PARTICIPANT);
  assert.deepEqual(l.slice(-3),['reflection','recall','complete']);assert.deepEqual(l.slice(1,9),['materials_1','read_1','cognition_1','edit_1','post_1','trust_post_1','perception_1','responsibility_1']);
  for(let i=0;i<l.length-1;i++)assert.equal(nextPhase(l[i],PROTOCOL_VERSION),l[i+1]);
  assert.equal(nextPhase('post',LEGACY_V4),undefined);
  assert.deepEqual(splitPhase('trust_post_2'),{base:'trust_post',index:2});assert.deepEqual(splitPhase('recall'),{base:'recall',index:null});
  assert.equal(SENDERS.length>=CASES_PER_PARTICIPANT,true);
});
test('blocks: ids unique within a block, scales well formed, sender placeholders, no AI wording before recall',()=>{
  for(const [phase,b] of Object.entries(measurement.blocks)){
    assert.equal(new Set(b.questions.map(q=>q.id)).size,b.questions.length,phase);
    for(const q of b.questions){
      if(q.type==='choice')assert(Array.isArray(q.options)&&q.options.length>=2,q.id);
      else if(q.type==='range'){assert.equal(q.min,0);assert.equal(q.max,100);assert(Array.isArray(q.ends)&&q.ends.length===2,q.id)}
      else if(q.type==='text')assert(q.maxLength>0,q.id);
      else{assert(Number.isInteger(q.min)&&Number.isInteger(q.max)&&q.min<q.max,q.id);assert(typeof q.ends==='string',q.id)}
      if(!['recall'].includes(phase)&&!q.id.startsWith('bg_'))assert(!q.text.includes('AI'),q.id);
      assert(!q.text.includes('佐藤'),q.id+' must use {sender}');
    }
  }
  assert.equal(blockFor('cognition_3').questions.filter(q=>q.id.startsWith('suff_')).length,6);
  assert.deepEqual(blockFor('cognition').questions.filter(q=>q.id.startsWith('tr_')).map(q=>q.id),blockFor('trust_post_1').questions.map(q=>q.id));
  assert.equal(blockFor('post').questions.filter(q=>q.type==='range').length,6);
  assert(scoringNotes().rtlx.includes('無加重'));
});
test('cases: 6 cases, four conditions registered, sender placeholder in handoff, precheck answers present',()=>{
  assert.equal(cases.cases.length,6);
  assert.deepEqual(cases.conditions,['baseline','missing_info','off_focus','overreach']);
  for(const c of cases.cases){const v=c.bases[0].versions;assert(v.baseline&&v.missing_info&&v.off_focus&&v.overreach,c.id);assert(c.handoff.includes('{sender}'),c.id);assert.equal(c.sources.length,3)}
  assert.equal(cases.common.precheck.length,2);
  assert(cases.common.precheck.every(q=>Number.isInteger(q.answer)));
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validate,empty,removeSubject,score} from './model.js';
const library=()=>({subjects:[{id:'s',name:'Maths'},{id:'s2',name:'Science'}],topics:[{id:'t',name:'Algebra',subjectId:'s'},{id:'t2',name:'Cells',subjectId:'s2'}],cards:[{id:'c',topicId:'t',front:'2x=4',back:'2'},{id:'c2',topicId:'t2',front:'Cell',back:'Life'}],quizzes:[{id:'q',topicId:'t',title:'Basics',questions:[{prompt:'2+2?',options:['1','2','3','4'],correct:3}]}]});
test('backup round trip preserves cards and quizzes',()=>assert.deepEqual(validate(JSON.parse(JSON.stringify(library()))),library()));
test('rejects orphan records and unsafe image URLs',()=>{let d=library();d.cards[0].topicId='missing';assert.throws(()=>validate(d));d=library();d.cards[0].frontImage='javascript:alert(1)';assert.throws(()=>validate(d));});
test('rejects invalid quiz answers and duplicate IDs',()=>{let d=library();d.quizzes[0].questions[0].correct=4;assert.throws(()=>validate(d));d=library();d.cards[0].id='s';assert.throws(()=>validate(d));});
test('subject deletion removes children while preserving other subjects',()=>{let d=removeSubject(library(),'s');assert.equal(d.subjects.length,1);assert.equal(d.topics[0].id,'t2');assert.equal(d.cards[0].id,'c2');assert.equal(d.quizzes.length,0);assert.doesNotThrow(()=>validate(d));});
test('quiz score distinguishes incorrect and unanswered questions',()=>{const qs=[{correct:1},{correct:2},{correct:0}];assert.equal(score(qs,[1,0]),1);assert.equal(score(qs,[1,2,0]),3);});
test('empty library is valid',()=>assert.deepEqual(validate(empty()),empty()));

import {dueCards,rateCard,topicStats} from './model.js';
test('spaced repetition schedules Again sooner and grows Easy intervals',()=>{
 const now=1700000000000,c=library().cards[0];
 const again=rateCard(c,'again',now),hard=rateCard(c,'hard',now),easy=rateCard(c,'easy',now);
 assert.equal(again.review.due,now+600000);assert.equal(hard.review.interval,86400000);assert.equal(easy.review.interval,3*86400000);
 assert.ok(rateCard(easy,'easy',now).review.interval>easy.review.interval);
 assert.equal(rateCard(easy,'again',now).review.interval,600000);
 assert.deepEqual(dueCards([again,easy,c],now),[c]);assert.equal(dueCards([again],now+600000).length,1);
 assert.doesNotThrow(()=>validate({...library(),cards:[easy]}));
});
test('progress uses weighted quiz accuracy and counts due cards',()=>{
 const d=library();d.cards[0]=rateCard(d.cards[0],'hard',1000);d.attempts=[{id:'a',topicId:'t',title:'One',correct:1,total:2,at:1000},{id:'b',topicId:'t',title:'Two',correct:3,total:3,at:2000}];
 assert.deepEqual(topicStats(d,'t',2000),{cards:1,due:0,reviewed:1,attempts:2,accuracy:80});
 assert.equal(topicStats(d,'t2',2000).accuracy,null);assert.doesNotThrow(()=>validate(d));
 d.attempts[0].correct=3;assert.throws(()=>validate(d));
});

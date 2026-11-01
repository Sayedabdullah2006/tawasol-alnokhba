import test from 'node:test';import assert from 'node:assert/strict';
import {cardAction} from '../src/lib/workforce/task-move.ts';
const task={canWork:false,canMove:true,column:{kind:'new'},archived_at:null,board:{archived_at:null},requires_approval:true,blocked_reason:''};
test('a delegated mover can change another assignee task between ordinary work states',()=>{
 assert.equal(cardAction(task,'in_progress',false),'move');assert.equal(cardAction({...task,column:{kind:'in_progress'}},'new',false),'move');
});
test('movement permission never grants another assignee delivery or bypasses approval',()=>{
 assert.equal(cardAction(task,'review',false),null);assert.equal(cardAction(task,'done',false),null);assert.equal(cardAction({...task,column:{kind:'review'}},'done',false),null);
});
test('spectators and archived or blocked tasks preserve their restrictions',()=>{
 assert.equal(cardAction({...task,canMove:false},'in_progress',false),null);assert.equal(cardAction({...task,archived_at:'2026-11-01'},'in_progress',false),null);assert.equal(cardAction({...task,blocked_reason:'متطلب معلق'},'in_progress',false),null);
});
test('ordinary assignees keep their existing submission route',()=>{assert.equal(cardAction({...task,canWork:true,canMove:false},'review',false),'submit');});

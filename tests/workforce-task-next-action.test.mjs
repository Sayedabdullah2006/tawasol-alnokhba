import test from 'node:test';
import assert from 'node:assert/strict';
import { taskNextAction } from '../src/lib/workforce/task-next-action.ts';
const base = { frozen: false, kind: 'in_progress', canWork: true, canReview: false, blocked: false };
test('returned work directs its assignee to resubmit, and spectators cannot act', () => {
  assert.equal(taskNextAction({...base, submissionStatus:'changes'}).button, 'إعادة التسليم');
  assert.equal(taskNextAction({...base, submissionStatus:'changes',canWork:false}).action, null);
});
test('pending work can only be reviewed by an authorized reviewer', () => {
  assert.equal(taskNextAction({...base,kind:'review',submissionStatus:'pending',canReview:true}).action, 'review');
  assert.equal(taskNextAction({...base,kind:'review',submissionStatus:'pending'}).action, null);
  assert.equal(taskNextAction({...base,kind:'review',canReview:true}).action, null);
});
test('archived and completed tasks have no action; blockers take precedence over resubmission', () => {
  assert.equal(taskNextAction({...base,frozen:true,canReview:true}).action,null);
  assert.equal(taskNextAction({...base,kind:'done',submissionStatus:'changes'}).action,null);
  assert.equal(taskNextAction({...base,blocked:true,submissionStatus:'changes'}).action,'block');
  assert.equal(taskNextAction(base).action,'submit');
});

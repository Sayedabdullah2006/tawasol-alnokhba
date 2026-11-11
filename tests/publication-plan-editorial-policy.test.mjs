import assert from 'node:assert/strict'
import {test} from 'node:test'
import './register-ts-imports.mjs'
const {editorialKind,storyOpeningError,proposePlanTime,validateScheduleTime,xThreadPayload,isScheduleReserved,eligibleNarrative,remoteDeliveryState}=await import('../src/lib/publication-plan-editorial-policy.ts')
test('partial or pending publishing is never reported as completed',()=>{
 assert.equal(remoteDeliveryState('COMPLETED'),'completed')
 assert.equal(remoteDeliveryState('PARTIALLY_COMPLETED'),'uncertain')
 assert.equal(remoteDeliveryState('FAILED'),'failed')
 assert.equal(remoteDeliveryState('SCHEDULED'),'scheduled')
 assert.equal(remoteDeliveryState('IN_PROGRESS'),'scheduled')
})
test('a documented personal innovation is eligible without a recent prize or invented metric',()=>{
 const analysis={name:'مبتكر',has_real_photo:true,news_strength:'B',key_facts:['المشكلة','الفكرة','طريقة العمل']}
 assert.equal(eligibleNarrative(analysis,{mode:'evergreen'}),true)
 assert.equal(eligibleNarrative({...analysis,name:''},{mode:'evergreen'}),false)
 assert.equal(eligibleNarrative({...analysis,has_real_photo:false},{mode:'evergreen'}),false)
 assert.equal(eligibleNarrative({...analysis,key_facts:['خبر جائزة قديمة فقط']},{mode:'evergreen'}),false)
 assert.equal(eligibleNarrative(analysis,{mode:'unsuitable'}),false)
})
test('old publication dates do not disqualify a useful story; old awards cannot lead it',()=>{
 const angle={mode:'evergreen',historicalAwards:true}
 assert.equal(storyOpeningError('9 مواد أعادتها قبل أن تواصل طريق الكيمياء.\nدلال العزي بنت مسيرتها بالبحث والتعلم.\n🔹 زمالة وردت في حكايتها المنشورة عام 2022.',angle),null)
 assert.match(storyOpeningError('دلال العزي تنال جائزة دولية\nتفاصيل الإنجاز',angle),/تكريم قديم/)
 assert.equal(storyOpeningError('شخصية وقصة', {mode:'unsuitable'}),'المادة لا تملك زاوية حكاية مفيدة؛ اختر مادة أخرى')
})
test('story and personality slots alternate across days without changing planned formats',()=>{
 assert.deepEqual([editorialKind('2026-11-10',0),editorialKind('2026-11-10',1)],['story','profile'])
 assert.deepEqual([editorialKind('2026-11-11',0),editorialKind('2026-11-11',1)],['profile','story'])
})
test('automatic times stay in same Riyadh day and avoid a real one-hour conflict',()=>{
 const now=new Date('2026-11-10T05:00:00Z'),preferred='2026-11-10T17:30:00Z'
 assert.equal(proposePlanTime('2026-11-10',preferred,[],now),new Date(preferred).toISOString())
 const selected=proposePlanTime('2026-11-10',preferred,[preferred],now)
 assert.ok(Math.abs(Date.parse(selected)-Date.parse(preferred))>=3600000)
 assert.throws(()=>proposePlanTime('2026-11-10',preferred,[],new Date('2026-11-10T20:30:00Z')),/لا يوجد موعد/)
 assert.throws(()=>validateScheduleTime('2026-11-10T04:00:00Z',now),/مستقبلي/)
 assert.throws(()=>validateScheduleTime('2026-11-10T16:30:00Z',now),/بين 8 و11/)
})
test('approved X delivery keeps image on main post and link in a distinct linked reply',()=>{
 const args={main:'كيف تحولت فكرة إلى ابتكار؟',firstReply:'الحكاية: https://www.first1saudi.net/16631.html',attachments:['approved-image-key'],accountIds:[123],when:'2026-11-10T17:30:00Z'}
 const payload=xThreadPayload(args),posts=payload.publications[0].posts
 assert.equal(posts.length,2);assert.deepEqual(posts[0].attachmentPaths,['approved-image-key']);assert.equal(posts[1].content,args.firstReply);assert.equal(posts[1].attachmentPaths,undefined)
 assert.throws(()=>xThreadPayload({...args,attachments:[]}),/أكمل/)
 assert.throws(()=>xThreadPayload({...args,main:args.firstReply}),/الرد الأول/)
 assert.throws(()=>xThreadPayload({...args,main:'أ'.repeat(281)}),/حد X/)
 assert.throws(()=>xThreadPayload({...args,main:'1/3 جزء أول\n2/3 جزء ثان'}),/السلسلة/)
 assert.equal(isScheduleReserved('pending'),true);assert.equal(isScheduleReserved('uncertain'),true);assert.equal(isScheduleReserved('failed'),false)
})

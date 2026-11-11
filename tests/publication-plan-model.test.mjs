import assert from 'node:assert/strict'
import {test} from 'node:test'
import './register-ts-imports.mjs'
const {dayRange,validatePlanInput,firstThirtyDayProposal,mergeFutureDays,eligibleSourceDate,parseTweetBundle,riyadhDay,validateProposal}=await import('../src/lib/publication-plan-model.ts')
const {FIRST_PLAN_INSTRUCTIONS}=await import('../src/lib/first-publication-plan.ts')
const {nov21ExperimentPrompt}=await import('../src/lib/publication-plan-experiment-model.ts')
const {buildCompactImagePrompt}=await import('../src/lib/studio-image-prompt.ts')
const {STUDIO_NEWS_LAYOUT_RULES}=await import('../src/lib/studio-reference-prompts.ts')
const input={name:'خطة رفع الوصول – 30 يومًا',startDate:'2026-11-10',endDate:'2026-12-09',times:['20:30','22:30'],instructions:FIRST_PLAN_INSTRUCTIONS}

test('first plan covers exactly 30 inclusive Riyadh dates and 60 slots at approved times',()=>{
 const p=firstThirtyDayProposal(validatePlanInput(input))
 assert.equal(p.days.length,30);assert.equal(p.days.flatMap(d=>d.slots).length,60)
 assert.equal(p.days[0].date,'2026-11-10');assert.equal(p.days.at(-1).date,'2026-12-09')
 assert.ok(p.days.every(d=>d.slots.map(s=>s.time).join(',')==='20:30,22:30'))
 assert.ok(p.days.slice(0,7).every(d=>d.slots.every(s=>s.type==='story')))
 assert.deepEqual(p.days.find(d=>d.date==='2026-11-17').slots.map(s=>s.type),['thread','story'])
 assert.deepEqual(p.days.find(d=>d.date==='2026-11-19').slots.map(s=>s.type),['carousel','story'])
 assert.equal(p.days.find(d=>d.date==='2026-11-26').slots[0].topic,'أوائل الأسبوع: خمسة إنجازات موثقة')
})
test('Nov 21 exception is explicit, unique and never mutates the reference',()=>{
 const before=STUDIO_NEWS_LAYOUT_RULES,p=firstThirtyDayProposal(input)
 const variants=p.days.flatMap(d=>d.slots.filter(s=>s.testException).map(s=>({date:d.date,slot:s})))
 assert.equal(variants.length,1);assert.equal(variants[0].date,'2026-11-21');assert.equal(variants[0].slot.test,'استثناء اختبار')
 const base=buildCompactImagePrompt({analysis:{name:'سارة عبدالله',poster_headline:'تفوز بجائزة علمية',standout_metric:'3 جوائز موثقة'},chosenConcept:''})
 const experiment=nov21ExperimentPrompt(base,'2026-11-21')
 assert.match(base,/at least 60%/);assert.match(experiment,/BETWEEN 25% AND 35%/)
 assert.doesNotMatch(experiment,/occupying at least 60%/)
 assert.match(experiment,/identity-logo.svg/);assert.match(experiment,/original posture/)
 assert.equal(STUDIO_NEWS_LAYOUT_RULES,before)
 assert.throws(()=>nov21ExperimentPrompt(base,'2026-11-22'),/21 نوفمبر/)
})
test('invalid dates, more than two posts and out-of-window times cannot become plans',()=>{
 assert.throws(()=>dayRange('2026-02-30','2026-03-02'))
 assert.throws(()=>validatePlanInput({...input,times:['20:30','21:30','22:30']}))
 assert.throws(()=>validatePlanInput({...input,times:['19:00']}))
 assert.throws(()=>validatePlanInput({...input,instructions:' '}))
 assert.throws(()=>validateProposal({days:[]},input),/يغطي/)
})
test('active plan edits preserve past, current and already published dates',()=>{
 const original=firstThirtyDayProposal(input),next=structuredClone(original)
 next.days.forEach(d=>d.phase='تعديل مستقبلي')
 const merged=mergeFutureDays(original,next,'2026-11-15',['2026-11-18'])
 assert.equal(merged.days.find(d=>d.date==='2026-11-15').phase,'تثبيت النمط الجديد')
 assert.equal(merged.days.find(d=>d.date==='2026-11-14').phase,'تثبيت النمط الجديد')
 assert.equal(merged.days.find(d=>d.date==='2026-11-18').phase,'اختبار عنصر واحد')
 assert.equal(merged.days.find(d=>d.date==='2026-11-16').phase,'تعديل مستقبلي')
})
test('30-day dedup accepts quotes only as the explicit exception',()=>{
 assert.equal(eligibleSourceDate('2026-11-10','2026-11-20','story'),false)
 assert.equal(eligibleSourceDate('2026-11-10','2026-11-20','quote'),true)
 assert.equal(eligibleSourceDate('2026-11-10','2026-12-10','story'),true)
 assert.equal(riyadhDay(new Date('2026-11-09T21:01:00Z')),'2026-11-10')
})
test('review parser separates the first reply, three hooks and accounts from public main text',()=>{
 const raw='التغريدة الرئيسية:\nأكسفورد تختار موهبتين سعوديتين\nالرد الأول (مع الرابط):\nاقرأ الحكاية: يُدرج رابط الحكاية بعد نشرها\n3 بدائل للخطاف:\n1. البديل الأول\n2. البديل الثاني\n3. البديل الثالث\nالحسابات المقترح ذكرها:\nلا حساب مثبت\nوقت النشر المقترح:\n20:30'
 const result=parseTweetBundle(raw,'https://www.first1saudi.net/31683.html')
 assert.equal(result.main,'أكسفورد تختار موهبتين سعوديتين');assert.equal(result.hooks.length,3)
 assert.match(result.firstReply,/31683.html/);assert.doesNotMatch(result.main,/first1saudi.net|بدائل/)
 assert.throws(()=>parseTweetBundle(raw.replace('أكسفورد تختار موهبتين سعوديتين','رابط https://www.first1saudi.net/1.html'),'https://www.first1saudi.net/1.html'))
 assert.equal(parseTweetBundle(raw.replace('الرد الأول (مع الرابط):','الرد الأول بالرابط:'),'https://www.first1saudi.net/31683.html').firstReply,'اقرأ الحكاية: https://www.first1saudi.net/31683.html')
})
test('review parser preserves real hashtags and keeps model length notes out of the post',()=>{
 const raw='## التغريدة الرئيسية:\nقصة سعودية موثقة\n#الكاراتيه #رياضة\n\nالطول الموزون تقديريًا: ضمن حد 280 محرفًا.\nالرد الأول (مع الرابط):\nhttps://www.first1saudi.net/30816.html\n3 بدائل للخطاف:\n1. الأول\n2. الثاني\n3. الثالث\nالحسابات المقترح ذكرها:\nلا حساب مثبت'
 const result=parseTweetBundle(raw,'https://www.first1saudi.net/30816.html')
 assert.equal(result.main,'قصة سعودية موثقة\n#الكاراتيه #رياضة')
 assert.doesNotMatch(result.main,/الطول الموزون|280/)
})

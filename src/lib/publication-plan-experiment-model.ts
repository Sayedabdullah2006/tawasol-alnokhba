import { STUDIO_NEWS_LAYOUT_RULES } from './studio-reference-prompts'

/** Owner-authorized, date-scoped runtime variant. The reference prompt is never mutated. */
export function nov21ExperimentPrompt(basePrompt:string,day:string):string {
  if(day!=='2026-11-21')throw new Error('استثناء اختبار الرقم مصرح ليوم 21 نوفمبر 2026 فقط')
  if(!basePrompt.includes(STUDIO_NEWS_LAYOUT_RULES))throw new Error('تعذر تثبيت حدود تجربة التصميم على المرجع المعتمد')
  const layout=STUDIO_NEWS_LAYOUT_RULES.replace(/3\. The actual[\s\S]*?(?=4\.)/u,
    '3. OWNER-AUTHORIZED EXCEPTION TEST, 2026-11-21 ONLY: the one verified number is the dominant visual element. The actual unchanged achievement-holder photograph occupies BETWEEN 25% AND 35% of the canvas, target 30%, with a clear recognizable face. Keep the full name and one achievement line readable. Preserve the exact face, expression, garments, body, pose and all original identity constraints; adapt composition, never the person. Do not invent missing body parts. This one controlled variant overrides only the normal 60% photo allocation for this render; it is not a new brand rule and is not permitted on another date.\n')
  return basePrompt.replace(STUDIO_NEWS_LAYOUT_RULES,layout)+'\nSCOPED TEST RECORD: number-dominant-2026-11-21. All facts, original logo/social footer, 1080×1350 size and identity/face locks remain mandatory. Compare against the separately generated normal 60%+ photo variant of the same source story.'
}

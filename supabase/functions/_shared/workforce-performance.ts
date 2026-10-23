/** Evidence-based task evaluation. Never reads payroll or attendance. */
export type PerformanceDelivery = { round: number; revision_due_at?:string|null; delivered_at: string; due_at: string; status: string; category: string | null; incomplete: boolean; affected: boolean; decided_at: string | null };
export type PerformanceTask = { task_id: string; title: string; participant_count?:number; starts_at?:string|null; created_at?:string; source?:"historical"|"tracked"; planned_days?:number|null; notes?:string[]; limitations?:("all"|"timing"|"quality"|"completion")[]; size: "small" | "medium" | "large" | null; due_at: string | null; configured_at: string | null; responsibility: string; shared: boolean; archived?:boolean; withdrawn: boolean; state: string; exception_reason: string | null; deliveries: PerformanceDelivery[] };
export type PerformanceRow = { id: string; title: string; source?:"historical"|"tracked"; plannedDays?:number|null; weight: number; share:number; due: string | null; revisionDue:string|null; submitted: string | null; status: string; reason: string; returns: number; punctuality: number | null; quality: number | null; completed: boolean; eligible: boolean; responsibility: string; exception: string | null };
export type PerformanceSummary = { month: string; generatedAt: string; score: number | null; eligible: number; required: number; completed: number; late: number; pending: number; revisions: number; excluded: number; axes: { punctuality: number | null; quality: number | null; completion: number | null }; rows: PerformanceRow[] };
const weight = { small: 1, medium: 2, large: 3 };
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" });
/** Only working minutes (09–17 Riyadh), excluding Fridays and fixed national holidays. */
export function workingDelay(due: string, submitted: string) {
  const start = Date.parse(due), end = Date.parse(submitted);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  let minutes = 0;
  for (let day = Date.parse(`${dayKey(new Date(start))}T00:00:00+03:00`); day < end; day += 86400000) {
    const date = new Date(day + 3 * 3600000), key = dayKey(new Date(day));
    if (date.getUTCDay() === 5 || ["02-22", "09-23"].includes(key.slice(5))) continue;
    minutes += Math.max(0, Math.min(end, day + 17 * 3600000) - Math.max(start, day + 9 * 3600000)) / 60000;
  }
  return minutes;
}
export function scheduledTaskSize(start:string|null, due:string|null){
 if(!start||!due||!Number.isFinite(Date.parse(start))||!Number.isFinite(Date.parse(due))||Date.parse(due)<=Date.parse(start))return null;
 const minutes=workingDelay(start,due),days=Math.ceil(minutes/480);
 if(!days)return null;
 const size:"small"|"medium"|"large"=days<=1?"small":days<=5?"medium":"large";
 return {size,days,weight:weight[size]};
}
export type PerformanceEvidence={
 task_id:string;title:string;employee_id:string;employee_start:string;created_at:string;starts_at:string|null;due_at:string|null;state:string;shared:boolean;participant_count?:number;archived:boolean;
 config:(Pick<PerformanceTask,"configured_at"|"responsibility"|"withdrawn">&{participant_count?:number;starts_at:string|null;due_at:string|null;weight_due_at:string|null})|null;
 deliveries:PerformanceDelivery[];exceptions:{created_at:string;previous_due_at:string|null;new_due_at:string;reason:string}[];
 history:{command:string;at:string;payload:{starts_at?:string|null;due_at?:string|null;assignee_id?:string|null;co_assignee_ids?:string[]}}[];
 submissions:{round:number;at:string;status:string;decided_at:string|null;own:boolean}[];
};
/** Historical reconstruction is read-only; unknown reasons are never guessed from prose. */
export function performanceFacts(evidence:PerformanceEvidence[],asOf:Date):PerformanceTask[]{
 const cutoff=asOf.getTime();
 return evidence.filter(e=>Date.parse(e.created_at)<=cutoff).map(e=>{
  const config=e.config,exceptions=e.exceptions.filter(x=>Date.parse(x.created_at)<=cutoff),approved=exceptions.at(-1);
  if(config?.configured_at&&Date.parse(config.configured_at)<=cutoff){
   const due=approved?.new_due_at??e.exceptions[0]?.previous_due_at??config.due_at;
   const size=scheduledTaskSize(config.starts_at,config.weight_due_at);
   return {task_id:e.task_id,title:e.title,participant_count:config.participant_count??e.participant_count??1,starts_at:undefined,planned_days:size?.days??null,size:size?.size??null,due_at:due,created_at:e.created_at,source:"tracked" as const,configured_at:config.configured_at,responsibility:config.responsibility,withdrawn:config.withdrawn,shared:e.shared,state:e.state,archived:e.archived,exception_reason:approved?.reason??null,deliveries:e.deliveries};
  }
  const history=e.history.filter(h=>Date.parse(h.at)<=cutoff).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  const original=history.find(h=>h.command==="task:create");
  let start=original?.payload.starts_at??null,due=original?.payload.due_at??null,uncertain=false,assignmentChanged=false;
  const submissions=e.submissions.filter(s=>Date.parse(s.at)<=cutoff).sort((a,b)=>a.round-b.round),first=submissions[0];
  let owner=original?.payload.assignee_id,co=original?.payload.co_assignee_ids??[];
  for(const edit of history.filter(h=>h.command==="task:edit")){
   const p=edit.payload;
   if((p.assignee_id!==undefined&&p.assignee_id!==owner)||(p.co_assignee_ids!==undefined&&[...p.co_assignee_ids].sort().join()!==[...co].sort().join()))assignmentChanged=true;
   if(p.assignee_id!==undefined)owner=p.assignee_id;if(p.co_assignee_ids!==undefined)co=p.co_assignee_ids;
   const changed=(p.due_at!==undefined&&Date.parse(p.due_at??"")!==Date.parse(due??""))||(p.starts_at!==undefined&&Date.parse(p.starts_at??"")!==Date.parse(start??""));
   if(changed){if(due&&Date.parse(edit.at)<Date.parse(due)&&(!first||Date.parse(edit.at)<Date.parse(first.at))){if(p.due_at!==undefined)due=p.due_at;if(p.starts_at!==undefined)start=p.starts_at;}else uncertain=true;}
  }
  const notes:string[]=[],limitations:NonNullable<PerformanceTask['limitations']>=[];
  if(!original||!start||!due){notes.push("تواريخ التكليف الأصلية غير موثقة");limitations.push("all");}
  if(e.shared||assignmentChanged||co.length){notes.push("الإسناد أو المساهمة الفردية التاريخية غير موثقة");limitations.push("all");}
  if(due&&dayKey(new Date(due))<e.employee_start){notes.push("قبل تاريخ المباشرة");limitations.push("all");}
  if(uncertain){notes.push("تعديل تاريخي للمدة بعد التسليم أو الموعد؛ الالتزام مستبعد");limitations.push("timing");}
  const unknownReturns=submissions.some(s=>s.status==="changes"&&s.decided_at&&Date.parse(s.decided_at)<=cutoff);
  if(unknownReturns){notes.push("سبب الإرجاع التاريخي غير مصنف؛ لا يُحتسب ضد الموظفة");limitations.push("quality","timing");if(submissions.at(-1)?.status==="changes")limitations.push("completion");}
  const size=scheduledTaskSize(start,due);
  const deliveries:PerformanceDelivery[]=submissions.filter(s=>s.own&&!e.shared&&!assignmentChanged).map(s=>({round:s.round,delivered_at:s.at,due_at:due??e.due_at??s.at,status:s.decided_at&&Date.parse(s.decided_at)>cutoff?"pending":s.status,decided_at:s.decided_at,category:null,incomplete:false,affected:false}));
  return {task_id:e.task_id,title:e.title,participant_count:e.participant_count??1,starts_at:start,created_at:e.created_at,size:size?.size??null,due_at:due??e.due_at,source:"historical" as const,configured_at:original?.at??null,responsibility:"",withdrawn:false,shared:e.shared||assignmentChanged,state:e.state,archived:e.archived,exception_reason:null,deliveries,notes,limitations};
 });
}

export function weeklyTaskActivity(tasks:PerformanceTask[],start:string,asOf:Date){
 const from=Date.parse(`${start}T00:00:00+03:00`),end=asOf.getTime();
 let completed=0,unfinished=0,pendingReview=0,overdue=0,onTime=0,lateSubmissions=0,changesCount=0,repeatedChanges=0;
 for(const task of tasks){
  const deliveries=task.deliveries.filter(d=>Date.parse(d.delivered_at)<end).sort((a,b)=>a.round-b.round).map(d=>({...d,...(d.decided_at&&Date.parse(d.decided_at)>=end?{status:"pending"}: {})}));
  const last=deliveries.at(-1),accepted=last?.status==="approved",pending=last?.status==="pending";
  if(accepted&&last.decided_at&&Date.parse(last.decided_at)>=from)completed++;
  if(!accepted&&task.state!=="done"){if(pending)pendingReview++;else unfinished++;}
  const limits=task.limitations??[],timingKnown=!limits.includes("all")&&!limits.includes("timing");
  const due=last?.status==="changes"?last.revision_due_at:task.due_at;
  if(!accepted&&!pending&&task.state!=="done"&&due&&Date.parse(due)<end&&timingKnown)overdue++;
  const first=deliveries.find(d=>!d.incomplete);
  if(first&&Date.parse(first.delivered_at)>=from&&timingKnown){if(Date.parse(first.delivered_at)<=Date.parse(task.due_at??first.due_at))onTime++;else lateSubmissions++;}
  const attributable=deliveries.filter(d=>d.status==="changes"&&d.category==="requirements"&&d.affected&&d.decided_at&&Date.parse(d.decided_at)<end);
  const returned=attributable.filter(d=>Date.parse(d.decided_at!)>=from).length;changesCount+=returned;if(returned&&attributable.length>=2)repeatedChanges++;
 }
 return {completed,unfinished,pendingReview,overdue,onTime,lateSubmissions,changesCount,repeatedChanges};
}
export function evaluatePerformance(tasks: PerformanceTask[], month: string, now = new Date()): PerformanceSummary {
  const start = Date.parse(`${month}-01T00:00:00+03:00`);
  const next = new Date(start + 32 * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Riyadh" }).slice(0, 7);
  const end = Math.min(now.getTime(), Date.parse(`${next}-01T00:00:00+03:00`) - 1);
  const rows: PerformanceRow[] = [];
  if(end<start)return {month,generatedAt:now.toISOString(),score:null,eligible:0,required:5,completed:0,late:0,pending:0,revisions:0,excluded:0,axes:{punctuality:null,quality:null,completion:null},rows};
  for (const task of tasks) {
    // Use evidence known at the selected month's end, not a later approval or return.
    const deliveries = task.deliveries.filter(d => Date.parse(d.delivered_at) <= end).sort((a,b) => a.round-b.round).map(d => ({...d, ...(d.decided_at && Date.parse(d.decided_at)>end ? {status:"pending",category:null,incomplete:false,affected:false} : {})}));
    const complete = deliveries.filter((d,i,all) => !d.incomplete && !all.slice(0,i).some(previous=>!previous.incomplete&&previous.delivered_at===d.delivered_at&&previous.due_at===d.due_at)), first = complete[0], last = deliveries.at(-1);
    const due = task.due_at, dueTime = due ? Date.parse(due) : NaN;
    if (!((dueTime >= start && dueTime <= end) || (dueTime<start && task.state!=="done" && !task.archived) || deliveries.some(d => Date.parse(d.delivered_at) >= start))) continue;
    const automatic=task.starts_at!==undefined?scheduledTaskSize(task.starts_at,task.due_at):null;
    const size=task.starts_at!==undefined?automatic?.size??null:task.size;
    const limited=(axis:string)=>task.limitations?.some(value=>value==="all"||value===axis)??false;
    const unknown = deliveries.some(d => d.status === "changes" && !d.category);
    const eligible = !!(task.configured_at && size && due  && !task.withdrawn && !(task.archived&&task.state!=="done") && !limited("all") && !(task.state==="done" && !deliveries.length) && Date.parse(task.configured_at) <= (first ? Date.parse(first.delivered_at) : end));
    const returns = deliveries.filter(d => d.status === "changes" && d.category === "requirements" && d.affected).length;
    // Review waiting is not incomplete work. Open future work is outside the denominator.
    const pending = last?.status === "pending";
    const completed = last ? last.status === "approved" && !last.incomplete : task.state === "done";
    const considered = dueTime <= end && !pending && !(last?.status==="changes" && last.revision_due_at && Date.parse(last.revision_due_at)>end);
    const timing = complete.map((d,i) => Math.max(0, 100 - workingDelay(i===0?due!:d.due_at, d.delivered_at) / 480 * 25));
    let punctuality = timing.length ? timing.reduce((a,b)=>a+b,0)/timing.length : null;
    if (considered && !completed && (!last || last.status === "changes")) {
      const revisionDue = last?.revision_due_at ?? task.due_at;
      const openTiming = Math.max(0,100-workingDelay(revisionDue!,new Date(end).toISOString())/480*25);
      punctuality = punctuality === null ? openTiming : Math.min(punctuality,openTiming);
    }
    rows.push({ id: task.task_id, title: task.title, source:task.source,plannedDays:automatic?.days??task.planned_days??null,share:1/Math.max(1,task.participant_count??(task.shared?2:1)),weight: (size ? weight[size] : 1)/Math.max(1,task.participant_count??(task.shared?2:1)), due, revisionDue:last?.status==="changes"?last.revision_due_at??null:null, submitted: first?.delivered_at ?? null,
      status: pending ? task.shared&&task.state!=="review"?"بانتظار تسليم الفريق":"بانتظار المراجعة" : completed ? "مكتملة" : (last?.status === "changes"||task.state==="changes") ? "للتعديل" : dueTime < end ? "مفتوحة" : "قادمة",
      reason: task.notes?.join(" · ") || (task.archived&&task.state!=="done"?"مؤرشفة قبل إكمالها":task.withdrawn ? "أعيد إسنادها" : !task.configured_at || !size ? "دون توثيق سابق للتقييم" : unknown ? "سبب الإرجاع غير مصنف" : pending ? "انتظار المراجعة لا يؤثر على الإنجاز" : last?.status==="changes"&&last.revision_due_at&&Date.parse(last.revision_due_at)>end?"موعد إعادة التسليم لم يحن":dueTime>end ? "موعدها لم يحن" : ""),
      returns, punctuality: eligible&&!unknown&&!limited("timing") ? punctuality : null, quality: eligible&&!unknown&&!limited("quality") && deliveries.some(d=>d.status!=="pending") ? Math.max(0,100-returns*20) : null,
      completed, eligible: eligible && considered&&!limited("completion")&&!(unknown&&last?.status==="changes"), responsibility: task.responsibility, exception: task.exception_reason });
  }
  const scored = rows.filter(r=>r.eligible), mean=(items:PerformanceRow[],key:"punctuality"|"quality")=>{const known=items.filter(r=>r[key]!==null);return known.length?Math.round(known.reduce((n,r)=>n+r[key]!*r.weight,0)/known.reduce((n,r)=>n+r.weight,0)):null;};
  const axes={punctuality:mean(scored,"punctuality"),quality:mean(scored,"quality"),completion:scored.length?Math.round(scored.reduce((n,r)=>n+(r.completed?r.weight:0),0)/scored.reduce((n,r)=>n+r.weight,0)*100):null};
  const eligible = scored.filter(r=>r.completed && r.quality!==null&&r.punctuality!==null).length;
  return {month,generatedAt:now.toISOString(),score:eligible>=5 && Object.values(axes).every(v=>v!==null)?Math.round(axes.punctuality!*0.4+axes.quality!*0.35+axes.completion!*0.25):null,
    eligible,required:5,completed:rows.filter(r=>r.completed).length,late:rows.filter(r=>r.punctuality!==null&&r.punctuality<100).length,pending:rows.filter(r=>r.status==="بانتظار المراجعة").length,revisions:rows.reduce((n,r)=>n+r.returns,0),excluded:rows.filter(r=>r.reason&&r.reason!=="انتظار المراجعة لا يؤثر على الإنجاز"&&r.reason!=="موعدها لم يحن").length,axes,rows:rows.sort((a,b)=>(a.due??"z").localeCompare(b.due??"z")||a.id.localeCompare(b.id))};
}

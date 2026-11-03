import type {OverallPerformance,PerformanceSummary} from './performance';
export type {OverallPerformance} from './performance';
/** Missing evidence stays unscored; it is never zeroed or reweighted silently. */
export function combinePerformance(tasks:Pick<PerformanceSummary,'score'|'eligible'|'required'>,sales:number|null,salesWeight=60,configured=true):OverallPerformance{
 if(!configured)return {score:tasks.score,sales:null,tasks:tasks.score,salesWeight:0,taskWeight:100,mode:'tasks',pending:tasks.score===null?[`تقييم المهام قيد التكوين (${tasks.eligible}/${tasks.required})`]:[]};
 if(!Number.isFinite(salesWeight)||salesWeight<0||salesWeight>100)throw Error('وزن المبيعات يجب أن يكون بين 0 و100');
 const taskWeight=100-salesWeight,pending:string[]=[];
 if(salesWeight>0&&sales===null)pending.push('تقييم المبيعات غير مكتمل');
 if(taskWeight>0&&tasks.score===null)pending.push(`تقييم المهام قيد التكوين (${tasks.eligible}/${tasks.required})`);
 const score=pending.length?null:Math.round(((sales??0)*salesWeight+(tasks.score??0)*taskWeight)/100*10)/10;
 return {score,sales,tasks:tasks.score,salesWeight,taskWeight,mode:'combined',pending};
}

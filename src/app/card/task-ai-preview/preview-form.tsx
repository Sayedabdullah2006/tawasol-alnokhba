"use client";
import {useState} from 'react';
import TaskFields,{taskForm} from '@/components/workforce/TaskFields';
import type {TaskSuggestion} from '@/lib/workforce/task-suggestion';
export default function PreviewForm({sample}:{sample:{title:string;suggestion:TaskSuggestion}}){
 const [value,setValue]=useState({...taskForm(),title:sample.title});
 return <div className="rounded-3xl border border-white/20 bg-[#10243c] p-5 text-white sm:p-6"><TaskFields value={value} onChange={setValue} admin canAssign={false} autoFill suggest={async title=>{if(title!==sample.title)throw new Error('هذه المعاينة للاقتراح المولد للعنوان المعروض');return sample.suggestion;}}/><button type="button" disabled className="mt-5 w-full rounded-xl bg-amber-200/40 p-3 font-bold">حفظ المهمة</button></div>;
}

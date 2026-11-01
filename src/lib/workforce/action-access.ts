/** Personal requests remain available even when attendance is unavailable. */
export const OFF_DUTY_REQUESTS = new Set([
  "leave", "permission", "overtime", "remote-work", "attendance-correction",
  "resignation", "missing-hours", "general", "letter", "payroll-review",
]);
export function attendanceExemptPath(path: string) {
  return /^\/api\/workforce\/(?:work-session|attendance|meetings\/presence|account\/password|notifications|test-mode|requests(?:\/remote-work\/(?:quote|document|settings)|\/[0-9a-f-]+\/(?:attachments\/[0-9a-f-]+|remote-agreement))?)$/.test(path);
}
export type ActionAccess = {allowed:boolean;reason:string;sessionId?:string;deviceHash?:string|null;state:string};
/** This exception is limited to task management, never attendance, timers or HR. */
export function offDutyTaskPath(path:string){
  return /^\/api\/workforce\/(?:tasks(?:\/suggest|\/[0-9a-f-]+(?:\/(?:attachments|comments|members|performance))?)?|checklist|comments|members|columns|boards(?:\/[0-9a-f-]+(?:\/members)?)?|attachments\/[0-9a-f-]+)$/.test(path);
}
export function canManageTasksOutsideAttendance(employee:{status:string;can_manage_tasks:boolean;can_manage_tasks_off_duty?:boolean}|null|undefined){
  return employee?.status==='active'&&employee.can_manage_tasks===true&&employee.can_manage_tasks_off_duty===true;
}

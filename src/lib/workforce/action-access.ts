/** Personal requests remain available even when attendance is unavailable. */
export const OFF_DUTY_REQUESTS = new Set([
  "leave", "permission", "overtime", "remote-work", "attendance-correction",
  "resignation", "missing-hours", "general", "letter", "payroll-review",
]);
export function attendanceExemptPath(path: string) {
  return /^\/api\/workforce\/(?:work-session|attendance|meetings\/presence|account\/password|notifications|test-mode|requests(?:\/remote-work\/(?:quote|document|settings)|\/[0-9a-f-]+\/(?:attachments\/[0-9a-f-]+|remote-agreement))?)$/.test(path);
}
export type ActionAccess = {allowed:boolean;reason:string;sessionId?:string;deviceHash?:string|null;state:string};

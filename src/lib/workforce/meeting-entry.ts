export function meetingEntryPath(id:string){return `/meetings/${encodeURIComponent(id)}`;}
export function meetingEntryURL(id:string,origin='https://nukhba.media'){return new URL(meetingEntryPath(id),origin).href;}
export function meetingPortalPath(id:string,role:string){return `${role==='admin'?'/admin/workforce/meetings':'/employee/meetings'}?meeting=${encodeURIComponent(id)}`;}

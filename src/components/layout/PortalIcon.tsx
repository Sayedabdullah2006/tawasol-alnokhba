import type { ReactNode } from "react";
const paths: Record<string, ReactNode> = {
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0" /></>,
  tasks: <><rect x="4" y="4" width="16" height="17" rx="3" /><path d="M8 2v4m8-4v4M8 11h8m-8 5h5" /></>,
  attendance: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
  finance: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18m0 4h-6v4h6M7 5V3h10v2" /></>,
  requests: <><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8m-8 4h5" /></>,
  knowledge: <><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3z" /><path d="M8 12h8m-8 4h5" /></>,
  notifications: <><path d="M5 17h14l-2-4V9a5 5 0 0 0-10 0v4zM10 21h4" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M2 21v-2a7 7 0 0 1 14 0v2M16 5a3 3 0 0 1 0 6m4 10v-2a7 7 0 0 0-3-6" /></>,
  home: <><path d="m3 10 9-7 9 7v11H3zM9 21v-7h6v7" /></>,
};
export default function PortalIcon({ name }: { name: string }) { return <svg className="portal-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{paths[name] ?? paths.tasks}</svg>; }

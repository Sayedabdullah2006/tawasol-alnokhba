export const socialPlatforms = [
  { key: "linkedin", label: "LinkedIn", hosts: ["linkedin.com"] },
  { key: "instagram", label: "Instagram", hosts: ["instagram.com"] },
  { key: "x", label: "X", hosts: ["x.com", "twitter.com"] },
  { key: "snapchat", label: "Snapchat", hosts: ["snapchat.com"] },
  { key: "tiktok", label: "TikTok", hosts: ["tiktok.com"] },
  { key: "facebook", label: "Facebook", hosts: ["facebook.com", "fb.com"] },
  { key: "youtube", label: "YouTube", hosts: ["youtube.com", "youtu.be"] },
  { key: "whatsapp", label: "WhatsApp", hosts: ["wa.me", "api.whatsapp.com", "whatsapp.com"] },
  { key: "website", label: "الموقع الشخصي", hosts: [] },
] as const;
export type CardCompany = { name: string; tagline: string; website: string; email: string; phone: string; address: string; version: number };
export type CardSnapshot = { name: string; title: string; email: string; phone: string; socials: Record<string, string>; company: Omit<CardCompany, "version"> };
export type BusinessProfile = { user_id: string; slug: string; display_name: string; job_title: string; work_email: string; work_phone: string; socials: Record<string,string>; published: CardSnapshot | null; issued_at: string | null; version: number; updated_at: string };
export type CardEditorData = { profile: BusinessProfile | null; company: CardCompany; name: string; title: string; admin: boolean };
export const cardPublicUrl = (slug: string) => `https://nukhba.media/card/${slug}`;

export function professionalUrl(value: string, hosts: readonly string[] = []) {
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.port || value.length > 500 || /\s/.test(value) || !u.hostname.includes(".") || u.hostname.endsWith(".local") || u.hostname.endsWith(".invalid") || /^\d+(\.\d+){3}$/.test(u.hostname)) throw new Error("invalid URL");
  if (hosts.length && !hosts.some(host => u.hostname === host || u.hostname.endsWith(`.${host}`))) throw new Error("invalid platform");
  return u.href;
}

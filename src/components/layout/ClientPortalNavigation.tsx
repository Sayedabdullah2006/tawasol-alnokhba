"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavEntry } from "./Sidebar";
import PortalIcon from "./PortalIcon";
export default function ClientPortalNavigation({ items }: { items: NavEntry[] }) {
  const pathname = usePathname();
  const icon = (href: string) => href.includes("profile") ? "profile" : href.includes("membership") ? "finance" : href.includes("request") && !href.startsWith("/dashboard/") ? "requests" : "tasks";
  return <nav className="portal-dock flex max-w-screen-2xl flex-wrap gap-2" aria-label="مساحة العميل">{items.map(item => "children" in item ? <details key={item.label} className="relative"><summary className="portal-launcher cursor-pointer list-none"><PortalIcon name="finance" />{item.label} ⌄</summary><div className="portal-submenu absolute right-0 top-full z-30 mt-2 min-w-64 rounded-2xl border p-2">{item.children.map(child => <Link key={child.href} href={child.href} className="block rounded-lg px-4 py-3 text-sm hover:bg-white/10">{child.label}</Link>)}</div></details> : <Link key={item.href} href={item.href} className="portal-launcher flex-1" aria-current={pathname === item.href.split(/[?#]/)[0] ? "page" : undefined}><PortalIcon name={icon(item.href)} />{item.label}</Link>)}</nav>;
}

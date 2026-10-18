"use client";
import { usePathname } from "next/navigation";
import Sidebar, {
  type NavEntry,
  type NavLeaf,
} from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";
import GenerationJobMonitor from "@/components/admin/GenerationJobMonitor";
export default function AdminAreaShell({
  children,
  items,
  flatItems,
}: {
  children: React.ReactNode;
  items: NavEntry[];
  flatItems: NavLeaf[];
}) {
  const pathname = usePathname();
  if (
    pathname === "/admin/workforce" ||
    pathname.startsWith("/admin/workforce/")
  )
    return children;
  return (
    <div className="admin-shell flex w-full min-w-0 flex-1 overflow-x-clip">
      <Sidebar items={items} title="لوحة الإدارة" />
      <div className="admin-content w-full min-w-0 flex-1 overflow-x-clip pb-20 md:pb-0">
        {children}
      </div>
      <BottomNav items={flatItems} />
      <GenerationJobMonitor />
    </div>
  );
}

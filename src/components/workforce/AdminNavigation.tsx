"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import PortalIcon from "@/components/layout/PortalIcon";
const links = [
  ["/admin/workforce", "الأداء والمهام"],
  ["/admin/workforce/employees", "الموظفات"],
  ["/admin/workforce/people", "شؤون الفريق"],
  ["/admin/workforce/attendance", "الحضور والإجازات"],
  ["/admin/workforce/payroll", "الرواتب والحوافز"],
  ["/admin/workforce/approvals", "طلبات الموظفات"],
  ["/admin/workforce/knowledge", "مركز المعرفة"],
  ["/admin/workforce/notifications", "الإشعارات"],
];
export default function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="أقسام إدارة الفريق المستقلة"
      className="portal-dock mx-auto flex w-full max-w-screen-2xl flex-wrap gap-2"
    >
      {links.map(([href, label], index) => (
        <Link
          key={href}
          href={href}
          aria-current={
            pathname === href ||
            (href !== "/admin/workforce" && pathname.startsWith(href + "/"))
              ? "page"
              : undefined
          }
          className="portal-launcher flex-1"
        >
          <PortalIcon name={["tasks","people","profile","attendance","finance","requests","knowledge","notifications"][index]} />
          {label}
        </Link>
      ))}
    </nav>
  );
}

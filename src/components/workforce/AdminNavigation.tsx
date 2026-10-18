"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
const links = [
  ["/admin/workforce", "الأداء والمهام"],
  ["/admin/workforce/employees", "الموظفات"],
  ["/admin/workforce/payroll", "الرواتب والحوافز"],
  ["/admin/workforce/approvals", "طلبات الموظفات"],
  ["/admin/workforce/notifications", "الإشعارات"],
];
export default function AdminNavigation() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="أقسام إدارة الفريق المستقلة"
      className="mx-auto flex w-full max-w-screen-2xl flex-wrap gap-2 border-b border-border bg-white p-4 md:px-8"
    >
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          aria-current={
            pathname === href ||
            (href !== "/admin/workforce" && pathname.startsWith(href + "/"))
              ? "page"
              : undefined
          }
          className={`rounded-xl px-4 py-3 text-sm font-bold ${pathname === href ? "bg-dark text-white" : "hover:bg-slate-100"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore, useState } from "react";
import { employeeModules } from "@/lib/workforce/navigation";

export default function EmployeeNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const collapsed = useSyncExternalStore(
    (notify) => {
      window.addEventListener("employee-sidebar", notify);
      return () => window.removeEventListener("employee-sidebar", notify);
    },
    () => localStorage.getItem("employee-sidebar-collapsed") === "true",
    () => false,
  );
  if (pathname === "/employee/unavailable") return null;
  return (
    <nav
      aria-label="أقسام بوابة الموظف"
      className={`border-b border-border bg-white lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] ${collapsed ? "lg:w-16" : "lg:w-64"} lg:shrink-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:p-3`}
    >
      <button
        type="button"
        className="hidden min-h-10 w-full items-center justify-between rounded-lg px-2 text-sm font-bold hover:bg-slate-100 lg:flex"
        aria-label={
          collapsed ? "توسيع القائمة الجانبية" : "طي القائمة الجانبية"
        }
        aria-expanded={!collapsed}
        aria-controls="employee-section-links"
        onClick={() => {
          localStorage.setItem(
            "employee-sidebar-collapsed",
            String(!collapsed),
          );
          window.dispatchEvent(new Event("employee-sidebar"));
        }}
      >
        {!collapsed && <span>أقسام البوابة</span>}
        <span aria-hidden="true">{collapsed ? "☰" : "→"}</span>
      </button>
      <button
        type="button"
        onClick={() => setMobileOpen((v) => !v)}
        aria-expanded={mobileOpen}
        aria-controls="employee-section-links"
        className="flex min-h-12 w-full items-center justify-between px-5 py-3 text-sm font-black lg:hidden"
      >
        أقسام البوابة <span aria-hidden="true">{mobileOpen ? "−" : "+"}</span>
      </button>
      <div
        id="employee-section-links"
        className={`${mobileOpen ? "block" : "hidden"} space-y-2 p-3 ${collapsed ? "lg:hidden" : "lg:block"} lg:p-0`}
      >
        <Link
          href="/employee"
          onClick={() => setMobileOpen(false)}
          aria-current={pathname === "/employee" ? "page" : undefined}
          className={`block rounded-xl px-4 py-3 text-sm font-bold ${pathname === "/employee" ? "bg-dark text-white" : "hover:bg-slate-100"}`}
        >
          الرئيسية
        </Link>
        {[
          ...employeeModules.filter((module) => module.key === "profile"),
          ...employeeModules.filter(
            (module) => !["profile", "finance"].includes(module.key),
          ),
        ].map((module) => {
          const screens = module.screens.filter(
            (screen) =>
              screen.available &&
              ![
                "/employee/finance/payslips",
                "/employee/finance/commissions",
              ].includes(screen.path),
          );
          if (!screens.length) return null;
          const links = screens.map((screen) => (
            <Link
              key={screen.path}
              href={screen.path}
              onClick={() => setMobileOpen(false)}
              aria-current={pathname === screen.path ? "page" : undefined}
              className={`block rounded-lg px-4 py-3 text-sm ${pathname === screen.path ? "bg-dark text-white" : "hover:bg-slate-100"}`}
            >
              {screen.title}
            </Link>
          ));
          return screens.length === 1 ? (
            <div key={module.key}>{links}</div>
          ) : (
            <details
              key={module.key}
              open={screens.some((screen) => pathname === screen.path)}
              className="rounded-xl border border-border"
            >
              <summary className="cursor-pointer px-4 py-3 text-sm font-bold">
                {module.title}
              </summary>
              <div className="px-2 pb-2">{links}</div>
            </details>
          );
        })}
      </div>
    </nav>
  );
}

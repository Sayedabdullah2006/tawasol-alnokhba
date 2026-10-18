"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { employeeModules } from "@/lib/workforce/navigation";

export default function EmployeeNavigation() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  if (pathname === "/employee/unavailable") return null;
  return (
    <nav
      aria-label="أقسام بوابة الموظف"
      className="border-b border-border bg-white lg:sticky lg:top-24 lg:max-h-[calc(100dvh-7rem)] lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:rounded-2xl lg:border lg:p-3"
    >
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
        className={`${mobileOpen ? "block" : "hidden"} space-y-2 p-3 lg:block lg:p-0`}
      >
        <Link
          href="/employee"
          onClick={() => setMobileOpen(false)}
          aria-current={pathname === "/employee" ? "page" : undefined}
          className={`block rounded-xl px-4 py-3 text-sm font-bold ${pathname === "/employee" ? "bg-dark text-white" : "hover:bg-slate-100"}`}
        >
          الرئيسية
        </Link>
        {employeeModules.map((module) => (
          <details
            key={module.key}
            open={
              module.screens.some((screen) => pathname === screen.path) ||
              pathname === `/employee/${module.key}`
            }
            className="rounded-xl border border-border"
          >
            <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-dark">
              {module.title}
            </summary>
            <div className="space-y-1 px-2 pb-2">
              {module.key !== "profile" && (
                <Link
                  href={`/employee/${module.key}`}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-lg px-4 py-2 text-xs font-bold text-muted hover:bg-slate-100"
                >
                  نظرة عامة على القسم
                </Link>
              )}
              {module.screens.map((screen) => (
                <Link
                  key={screen.path}
                  href={screen.path}
                  onClick={() => setMobileOpen(false)}
                  aria-current={pathname === screen.path ? "page" : undefined}
                  className={`block rounded-lg px-4 py-3 text-sm leading-6 ${pathname === screen.path ? "bg-dark text-white" : "text-dark hover:bg-slate-100"}`}
                >
                  {screen.title}
                </Link>
              ))}
            </div>
          </details>
        ))}
      </div>
    </nav>
  );
}

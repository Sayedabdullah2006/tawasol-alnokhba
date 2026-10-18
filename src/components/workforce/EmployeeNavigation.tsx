"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { employeeModules } from "@/lib/workforce/navigation";
export default function EmployeeNavigation() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  if (pathname === "/employee/unavailable") return null;
  const modules = [
    ...employeeModules.filter((m) => m.key === "profile"),
    ...employeeModules.filter(
      (m) =>
        !["profile", "finance", "knowledge", "notifications"].includes(m.key),
    ),
    ...employeeModules.filter((m) =>
      ["knowledge", "notifications"].includes(m.key),
    ),
  ];
  return (
    <nav
      aria-label="أقسام بوابة الموظف"
      className="relative z-30 w-full border-b border-border bg-white p-4 md:px-8"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(null);
          (event.target as HTMLElement)
            .closest("li")
            ?.querySelector("button")
            ?.focus();
        }
      }}
    >
      <ul className="flex w-full flex-wrap items-center gap-2">
        {modules.map((module) => {
          const screens = module.screens.filter(
            (s) =>
              s.available &&
              ![
                "/employee/finance/payslips",
                "/employee/finance/commissions",
              ].includes(s.path),
          );
          if (!screens.length) return null;
          const active = screens.some(
            (s) => pathname === s.path || pathname.startsWith(s.path + "/"),
          );
          const style = `flex min-h-12 items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors ${active ? "bg-dark text-white" : "text-dark hover:bg-slate-100"}`;
          if (module.key === "profile") {
            const advances = employeeModules
              .find((m) => m.key === "finance")
              ?.screens.find((s) => s.path === "/employee/finance/advances");
            if (advances) screens.push(advances);
          }
          return screens.length === 1 ? (
            <li key={module.key}>
              <Link
                href={screens[0].path}
                className={style}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(null)}
              >
                {module.title}
              </Link>
            </li>
          ) : (
            <li
              key={module.key}
              className="lg:relative"
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setOpen(module.key);
              }}
              onPointerLeave={(event) => {
                if (event.pointerType === "mouse") setOpen(null);
              }}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget))
                  setOpen(null);
              }}
            >
              <button
                type="button"
                className={style}
                aria-expanded={open === module.key}
                aria-controls={`employee-menu-${module.key}`}
                onClick={() => setOpen(open === module.key ? null : module.key)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setOpen(module.key);
                    requestAnimationFrame(() =>
                      document
                        .getElementById(`employee-menu-${module.key}`)
                        ?.querySelector("a")
                        ?.focus(),
                    );
                  }
                }}
              >
                {module.title}
                <span
                  aria-hidden="true"
                  className={`text-xs transition-transform ${open === module.key ? "rotate-180" : ""}`}
                >
                  ⌄
                </span>
              </button>
              {open === module.key && (
                <div
                  id={`employee-menu-${module.key}`}
                  className="absolute inset-x-3 top-full pt-2 lg:inset-x-auto lg:right-0 lg:min-w-64"
                >
                  <div className="max-h-[65dvh] overflow-y-auto rounded-2xl border border-border bg-white p-2 shadow-xl">
                    {screens.map((screen) => (
                      <Link
                        key={screen.path}
                        href={screen.path}
                        aria-current={
                          pathname === screen.path ? "page" : undefined
                        }
                        onClick={() => setOpen(null)}
                        className={`block rounded-xl px-4 py-3 text-sm ${pathname === screen.path ? "bg-dark text-white" : "text-dark hover:bg-slate-100"}`}
                      >
                        {screen.title}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

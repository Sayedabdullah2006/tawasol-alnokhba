"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { employeeModules } from "@/lib/workforce/navigation";
import PortalIcon from "@/components/layout/PortalIcon";
export default function EmployeeNavigation({ activePath }: { activePath?: string } = {}) {
  const currentPath = usePathname(), pathname = activePath ?? currentPath;
  const [open, setOpen] = useState<string | null>(null);
  if (pathname === "/employee/unavailable") return null;
  const modules = [
    ...employeeModules.filter((m) => m.key === "profile"),
    ...employeeModules.filter(
      (m) =>
        !["profile", "finance", "knowledge", "notifications"].includes(m.key),
    ),
    ...employeeModules.filter((m) =>
      m.key === "knowledge",
    ),
  ];
  return (
    <nav
      aria-label="أقسام بوابة الموظف"
      className="portal-dock employee-dock relative z-30 w-full"
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
      <ul className="grid w-full grid-cols-3 gap-2 lg:grid-cols-6">
        {modules.map((module) => {
          const screens = module.screens.filter((s) => s.available);
          if (!screens.length) return null;
          if (module.key === "performance") screens.unshift({ path: "/employee", title: "لوحة الأداء", purpose: "", related: [], available: true });
          if (module.key === "profile") {
            const finance = employeeModules.find((m) => m.key === "finance");
            for (const path of ["payslips", "commissions", "advances"]) {
              const page = finance?.screens.find((s) => s.path === `/employee/finance/${path}` && s.available);
              if (page) screens.push(page);
            }
          }
          const active = screens.some(
            (s) => pathname === s.path || (s.path !== "/employee" && pathname.startsWith(s.path + "/")),
          );
          const moduleActive = module.key === "work" ? pathname.startsWith("/employee/work/") : active;
          const style = "portal-launcher";
          const icon = module.key === "work" ? "tasks" : module.key;
          return screens.length === 1 ? (
            <li key={module.key}>
              <Link
                href={screens[0].path}
                className={style}
                aria-current={moduleActive ? "page" : undefined}
                onClick={() => setOpen(null)}
              >
                <PortalIcon name={icon} />
                <span>{module.title}</span>
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
                data-active={moduleActive}
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
                <PortalIcon name={icon} />
                <span>{module.title}</span>
                <span
                  aria-hidden="true"
                  className={`absolute end-2 top-2 text-xs opacity-60 transition-transform ${open === module.key ? "rotate-180" : ""}`}
                >
                  ⌄
                </span>
              </button>
              {open === module.key && (
                <div
                  id={`employee-menu-${module.key}`}
                  className="absolute inset-x-3 top-full pt-2 lg:inset-x-auto lg:right-0 lg:min-w-64"
                >
                  <div className="portal-submenu max-h-[65dvh] overflow-y-auto rounded-2xl border border-border bg-white p-2 shadow-xl">
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

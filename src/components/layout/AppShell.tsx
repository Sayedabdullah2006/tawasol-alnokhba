"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import Header from "./Header";
import Footer from "./Footer";
import DiscountPopup from "@/components/ui/DiscountPopup";
import WorkforceHeader from "@/components/workforce/WorkforceHeader";
import PortalScreen from "./PortalScreen";
import WorkSessionProvider, { WorkSessionBar } from "@/components/workforce/WorkSessionProvider";

/** Internal workspaces never mount customer navigation, marketing or promotions. */
export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/card/")) return <>{children}</>;
  const employee =
    pathname === "/employee" || pathname.startsWith("/employee/");
  const workforceAdmin =
    pathname === "/admin/workforce" || pathname.startsWith("/admin/workforce/");

  if (employee || workforceAdmin) {
    return (
      <PortalScreen area={employee ? "employee" : "team"}>
        <WorkforceHeader admin={workforceAdmin} />
        <main
          id="workspace-main"
          className="flex min-w-0 flex-1 flex-col pt-[132px] sm:pt-24"
        >
          {employee ? <WorkSessionProvider><WorkSessionBar />{children}</WorkSessionProvider> : children}
        </main>
        <footer className="px-5 pb-24 pt-6 text-center text-xs text-muted md:pb-6">
          تواصل النخبة · {employee ? "بوابة الموظف" : "إدارة فريق العمل"}
        </footer>
      </PortalScreen>
    );
  }

  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/") || pathname === "/admin" || pathname.startsWith("/admin/")) {
    return <PortalScreen area={pathname.startsWith("/admin") ? "admin" : "client"}><Header /><main className="flex min-w-0 flex-1 flex-col pt-[84px]">{children}</main><footer className="px-5 pb-16 pt-8 text-center text-xs text-muted">تواصل النخبة · اترك أثرًا دائمًا</footer></PortalScreen>;
  }
  return (
    <PortalScreen area="public">
      <Header />
      <main id="site-main" className="min-w-0 flex-1 flex flex-col pt-[84px]">{children}</main>
      <Footer />
      <DiscountPopup />
    </PortalScreen>
  );
}

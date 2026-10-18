import AttendanceHub from "@/components/workforce/AttendanceHub";
import { REQUEST_KINDS } from "@/lib/workforce/requests";
import RequestCenter from "@/components/workforce/RequestCenter";
import { notFound, redirect } from "next/navigation";
import EmployeeProfile from "@/components/workforce/EmployeeProfile";
import { employeePageActor } from "@/lib/workforce/employee-page";
import {
  employeeModules,
  findEmployeeScreen,
} from "@/lib/workforce/navigation";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ section: string[] }>;
  searchParams: Promise<{ request?: string }>;
}) {
  const { section } = await params;
  const path = `/employee/${section.join("/")}`;
  const { employee } = await employeePageActor();
  if (path === "/employee/documents") redirect("/employee/profile/documents");
  if (path === "/employee/payment-details")
    redirect("/employee/finance/payment-details");
  if (section[0] === "attendance") {
    if (
      section.length > 2 ||
      (section[1] &&
        !["overview", "schedule", "leave-balances"].includes(section[1]))
    )
      notFound();
    return <AttendanceHub section={section[1] || "overview"} />;
  }
  if (
    section[0] === "requests" &&
    section.length > 1 &&
    section[1] !== "profile-change" &&
    section[1] !== "history" &&
    !Object.hasOwn(REQUEST_KINDS, section[1])
  )
    notFound();
  if (section[0] === "requests" && section[1] !== "profile-change")
    return (
      <RequestCenter
        initialRequest={(await searchParams).request}
        startNew={!!section[1] && Object.hasOwn(REQUEST_KINDS, section[1])}
        initialKind={
          section[1] && section[1] !== "history" ? section[1] : "general"
        }
      />
    );
  const screen = findEmployeeScreen(path);
  const workspaceModule = employeeModules.find(
    (workspaceModule) =>
      `/employee/${workspaceModule.key}` === path ||
      workspaceModule.screens.some((item) => item.path === path),
  );
  if (!workspaceModule) notFound();
  if (screen?.live)
    return (
      <EmployeeProfile
        key={path}
        id={employee.id}
        role="employee"
        section={screen.live}
      />
    );

  const target = workspaceModule.screens.find((item) => item.available)?.path;
  if (target && target !== path) redirect(target);
  redirect("/employee");
}

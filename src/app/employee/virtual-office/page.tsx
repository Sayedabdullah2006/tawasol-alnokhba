import type { Metadata } from "next";
import EmployeeOffice from "@/components/virtual-office/EmployeeOffice";
import { employeePageActor } from "@/lib/workforce/employee-page";
import { employeeOfficeSnapshot } from "@/lib/virtual-office/employee-server";
import {
  OFFICE_DEPARTMENTS,
  type DepartmentId,
} from "@/lib/virtual-office/departments";
export const metadata: Metadata = { title: "مكتبي الافتراضي | تواصل النخبة" };
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ department?: string | string[]; view?: string }>;
}) {
  const actor = await employeePageActor();
  const initial = await employeeOfficeSnapshot(actor);
  const query = await searchParams;
  const ownDepartment =
    initial.staff.find((p) => p.id === initial.employeeId)?.officeDepartment ||
    "leadership";
  const department = (
    OFFICE_DEPARTMENTS.some((d) => d.id === query.department)
      ? query.department
      : ownDepartment
  ) as DepartmentId;
  return (
    <EmployeeOffice
      key={`${department}:${query.view}`}
      initial={initial}
      department={department}
      initialOverview={query.view === "company"}
    />
  );
}

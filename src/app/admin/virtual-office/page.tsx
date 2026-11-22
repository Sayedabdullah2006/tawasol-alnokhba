import type { Metadata } from "next";
import VirtualOffice from "@/components/virtual-office/VirtualOffice";
import {
  OFFICE_DEPARTMENTS,
  type DepartmentId,
} from "@/lib/virtual-office/departments";
export const metadata: Metadata = { title: "المكتب الافتراضي | تواصل النخبة" };
export default async function VirtualOfficePage({
  searchParams,
}: {
  searchParams: Promise<{ department?: string | string[] }>;
}) {
  const query = await searchParams;
  const department = OFFICE_DEPARTMENTS.some((d) => d.id === query.department)
    ? (query.department as DepartmentId)
    : "leadership";
  return <VirtualOffice initialDepartment={department} />;
}

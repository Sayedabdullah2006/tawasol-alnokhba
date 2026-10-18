import EmployeeProfile from "@/components/workforce/EmployeeProfile";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <EmployeeProfile id={(await params).id} role="admin" />;
}

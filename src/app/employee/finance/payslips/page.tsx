import EmployeeFinanceRecords from "@/components/workforce/EmployeeFinanceRecords";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page() {
  const { employee } = await employeePageActor();
  return <EmployeeFinanceRecords employeeId={employee.id} section="payslips" />;
}

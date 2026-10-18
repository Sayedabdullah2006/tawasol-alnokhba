import MonthlyPayroll from "@/components/workforce/MonthlyPayroll";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page() {
  const { employee } = await employeePageActor();
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <MonthlyPayroll employeeId={employee.id} />
    </div>
  );
}

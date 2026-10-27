import MonthlyPayroll from "@/components/workforce/MonthlyPayroll";
import EmployeeFinalSettlements from "@/components/workforce/EmployeeFinalSettlements";
import { employeePageActor } from "@/lib/workforce/employee-page";
import Link from "next/link";
import { payrollMonth } from "@/lib/workforce/payroll";
export default async function Page({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { employee } = await employeePageActor();
  const rawMonth = (await searchParams).month;
  let month: string | undefined;
  try { if (rawMonth) month = payrollMonth(rawMonth).slice(0, 7); } catch { /* Invalid links open the current month. */ }
  return (
    <div className="mx-auto max-w-6xl p-4 md:p-8">
      <nav aria-label="صفحات المستحقات" className="mb-4 flex flex-wrap gap-4 text-sm font-bold">
        <Link href="/employee/finance/payslips">كشوف الرواتب ←</Link>
        <Link href="/employee/finance/commissions">العمولات والمكافآت ←</Link>
        <Link href="/employee/finance/advances">السلف والالتزامات ←</Link>
      </nav>
      <EmployeeFinalSettlements />
      <MonthlyPayroll key={month || "current"} employeeId={employee.id} initialMonth={month} />
    </div>
  );
}

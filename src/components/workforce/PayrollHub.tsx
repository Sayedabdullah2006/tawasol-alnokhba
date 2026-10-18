"use client";
import { useState } from "react";
import { EmployeePicker } from "./TaskFields";
import MonthlyPayroll from "./MonthlyPayroll";
export default function PayrollHub() {
  const [employee, setEmployee] = useState("");
  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <h1 className="text-3xl font-black">الرواتب والحوافز</h1>
      <p className="text-sm leading-7 text-muted">
        إعداد الراتب والبدلات المستمرة، وتقدير حوافز كل شهر، واعتماد المستحقات
        وتوثيق الصرف.
      </p>
      {employee ? (
        <MonthlyPayroll
          key={employee}
          employeeId={employee}
          admin
          onClose={() => setEmployee("")}
        />
      ) : (
        <EmployeePicker
          value={employee}
          title="اختيار الموظفة لإدارة مستحقاتها"
          onChange={setEmployee}
        />
      )}
    </div>
  );
}

import type { Metadata } from "next";
import EmployeeNavigation from "@/components/workforce/EmployeeNavigation";

export const metadata: Metadata = {
  title: "بوابة الموظف | تواصل النخبة",
  description: "مساحة العمل الداخلية لموظفي تواصل النخبة",
  robots: { index: false, follow: false },
};

export default function EmployeeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-screen-2xl flex-col">
      <EmployeeNavigation />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

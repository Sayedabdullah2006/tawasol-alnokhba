import type { Metadata } from "next";
import VirtualOffice from "@/components/virtual-office/VirtualOffice";
export const metadata: Metadata = { title: "المكتب الافتراضي | تواصل النخبة" };
export default function VirtualOfficePage() {
  return <VirtualOffice />;
}

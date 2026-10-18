import NotificationCenter from "@/components/workforce/NotificationCenter";
import { employeePageActor } from "@/lib/workforce/employee-page";
export default async function Page() { await employeePageActor(); return <NotificationCenter />; }

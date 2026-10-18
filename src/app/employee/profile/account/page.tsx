import { employeePageActor } from "@/lib/workforce/employee-page";
import AccountSettings from "@/components/workforce/AccountSettings";
export default async function AccountPage() {
  const actor = await employeePageActor();
  return <AccountSettings name={actor.employee.full_name} email={actor.user.email ?? ""} cardHref="/employee/profile/business-card" />;
}

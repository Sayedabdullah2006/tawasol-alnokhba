import Meetings from '@/components/workforce/Meetings';import {employeePageActor} from '@/lib/workforce/employee-page';
export default async function Page(){await employeePageActor();return <Meetings/>;}

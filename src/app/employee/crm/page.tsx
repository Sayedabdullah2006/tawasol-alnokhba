import SalesWorkspace from '@/components/workforce/SalesWorkspace';
import {employeePageActor} from '@/lib/workforce/employee-page';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{month?:string}>}){await employeePageActor();return <SalesWorkspace initialMonth={(await searchParams).month} view="crm"/>;}

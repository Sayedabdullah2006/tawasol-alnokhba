import Meetings from '@/components/workforce/Meetings';import {workforceActor,requireAdmin} from '@/lib/workforce/server';
export default async function Page(){requireAdmin(await workforceActor());return <Meetings/>;}

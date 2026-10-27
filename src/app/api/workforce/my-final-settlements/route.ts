import { apiError, createServiceRoleClient, workforceActor } from '@/lib/workforce/server';
import { privateResponse } from '@/lib/workforce/task-server';
import { ownFinalSettlements } from '@/lib/workforce/employee-final-settlement';

export async function GET() {
  try {
    const actor = await workforceActor();
    const settlements = await ownFinalSettlements(actor, await createServiceRoleClient());
    return privateResponse({settlements});
  } catch (error) { return apiError(error); }
}

/** Shared paid fields for administrator-confirmed bank transfers. */
export function bankConfirmationFields(now:string){return {paid_at:now,payment_status:'paid' as const}}

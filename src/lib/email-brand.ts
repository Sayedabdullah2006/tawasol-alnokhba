import { AsyncLocalStorage } from 'node:async_hooks'
import { CUSTOMER_EMAIL_BRANDS, type CustomerEmailContext } from '../../supabase/functions/_shared/customer-email-brand'
export { customerEmailLinks, customerOrderUrl, partnerReminderEmail, customerEmailLogo } from '../../supabase/functions/_shared/customer-email-brand'
export type { CustomerEmailContext, CustomerEmailBrandId } from '../../supabase/functions/_shared/customer-email-brand'
const storage=new AsyncLocalStorage<CustomerEmailContext>()
export const emailContext=()=>storage.getStore()??{brand:'nukhba' as const}
export const emailBrand=()=>CUSTOMER_EMAIL_BRANDS[emailContext().brand]
export const withEmailBrand=<T>(context:CustomerEmailContext,render:()=>T):T=>storage.run(context,render)

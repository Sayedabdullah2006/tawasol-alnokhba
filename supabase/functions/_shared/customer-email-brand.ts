/** Shared, server-selected identities. No sender address or redirect comes from a customer. */
export type CustomerEmailBrandId = 'nukhba' | 'first1saudi'
export type CustomerEmailBrand = { id: CustomerEmailBrandId; name: string; english: string; site: string; primary: string; accent: string; background: string; supportEmail: string; unsubscribeEmail: string; from: string; description: string }
export const CUSTOMER_EMAIL_BRANDS: Record<CustomerEmailBrandId, CustomerEmailBrand> = {
  nukhba: { id:'nukhba',name:'تواصل النخبة',english:'TAWASOL ALNOKHBA',site:'https://nukhba.media',primary:'#0E2855',accent:'#C9A961',background:'#F7F4ED',supportEmail:'support@nukhba.media',unsubscribeEmail:'unsubscribe@nukhba.media',from:'Nukhba Platform <noreply@nukhba.media>',description:'منصة متخصصة في التسويق والإعلان الرقمي' },
  first1saudi: { id:'first1saudi',name:'شبكة أول سعودي',english:'FIRST SAUDI',site:'https://first1saudi.net',primary:'#175b40',accent:'#175b40',background:'#f5f8f3',supportEmail:'info@first1saudi.net',unsubscribeEmail:'info@first1saudi.net',from:'شبكة أول سعودي <noreply@nukhba.media>',description:'متابعة طلبات النشر عبر شبكة أول سعودي' },
}
export type CustomerEmailContext = { brand: CustomerEmailBrandId; requestId?: string }
export function customerEmailLogo(brand:CustomerEmailBrandId){return brand==='first1saudi'?'<a href="https://first1saudi.net" style="display:block;text-decoration:none"><img src="cid:first1saudi-email-logo" alt="شعار أول سعودي" width="204" height="87" style="display:block;width:204px;max-width:100%;height:auto;margin:0 auto 12px;border:0" /></a>':''}
export function escapeEmailHtml(value: string) { return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)) }
export function customerEmailPlainText(html:string){return html.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi,'').replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,'$2 ($1)').replace(/<\/(p|div|h[1-6]|tr)>|<br\s*\/?\s*>/gi,'\n').replace(/<[^>]+>/g,'').replaceAll('&amp;','&').replaceAll('&nbsp;',' ').replace(/\n\s*\n/g,'\n\n').trim()}
export function customerOrderUrl(context: CustomerEmailContext) {
  const brand=CUSTOMER_EMAIL_BRANDS[context.brand]
  if(context.brand==='nukhba')return brand.site+'/dashboard'+(context.requestId?'/'+encodeURIComponent(context.requestId):'')
  return brand.site+'/services/orders'+(context.requestId?'?order_id='+encodeURIComponent(context.requestId):'')
}
export function customerEmailLink(raw: string,context: CustomerEmailContext): string {
  if(context.brand==='nukhba')return raw
  const brand=CUSTOMER_EMAIL_BRANDS[context.brand]
  if(/^mailto:(support|unsubscribe)@nukhba\.media(?:\?|$)/i.test(raw))return 'mailto:'+brand.supportEmail
  let url: URL
  try { url=new URL(raw,'https://nukhba.media') } catch { return raw }
  if(url.origin!=='https://nukhba.media'&&url.origin!=='http://localhost:3030')return raw
  if(/^\/(dashboard|payment|review)(\/|$)/.test(url.pathname)||url.pathname.startsWith('/api/invoices/'))return customerOrderUrl(context)
  if(url.pathname==='/request')return brand.site+'/services'
  if(/^\/(login|register|forgot-password|reset-password|oauth)(\/|$)/.test(url.pathname))return brand.site+'/services/account'
  if(url.pathname==='/contact'||url.pathname==='/help'||url.pathname==='/unsubscribe')return brand.site+'/contact'
  if(url.pathname==='/')return brand.site
  // Do not send partner customers to a central account/admin action or forward its tokens.
  return brand.site+'/services/orders'
}
export function customerEmailLinks(html: string,context: CustomerEmailContext) {
  if(context.brand==='nukhba')return html
  return html.replace(/href=(['"])(.*?)\1/gi,(_match,quote:string,href:string)=>`href=${quote}${escapeEmailHtml(customerEmailLink(href.replaceAll('&amp;','&'),context))}${quote}`)
}
/** Legacy reminder bodies have no brand shell; keep customer text and external/image URLs intact. */
export function partnerReminderEmail(subject: string, html: string,context: CustomerEmailContext) {
  if(context.brand==='nukhba')return {subject,html}
  const brand=CUSTOMER_EMAIL_BRANDS[context.brand]
  const body=customerEmailLinks(html,context).replaceAll('#0E2855',brand.primary).replaceAll('#C9A961',brand.accent).replaceAll('مع تحيات فريق تواصل النخبة','مع تحيات فريق '+brand.name)
  return {subject:subject+' · '+brand.name,html:`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>${escapeEmailHtml(subject)}</title></head><body style="margin:0;background:${brand.background};font-family:Tahoma,Arial,sans-serif"><div style="max-width:600px;margin:24px auto;background:white"><header style="background:${brand.primary};color:white;padding:24px;text-align:center;font-size:22px;font-weight:bold">${customerEmailLogo(context.brand)}</header>${body}<footer style="padding:18px;text-align:center"><a href="https://wa.me/966543278747" style="color:${brand.primary};font-size:13px">دعم العملاء</a></footer></div></body></html>`}
}

/** Also normalize already-rendered/legacy templates at the transport boundary. */
export function customerEmailChrome(html: string, brand: CustomerEmailBrandId) {
 if(brand!=='first1saudi')return html
 return html
  .replace(/<h1\b[^>]*>\s*شبكة أول سعودي\s*<\/h1>/gi,'')
  .replace(/<p\b[^>]*>\s*FIRST SAUDI\s*<\/p>/gi,'')
  .replace(/<!-- Footer with contact info and unsubscribe -->\s*<tr>[\s\S]*?<\/table>\s*<\/td>\s*<\/tr>/i,'<tr><td style="padding:18px;text-align:center"><a href="https://wa.me/966543278747" style="color:#175b40">دعم العملاء</a></td></tr>')
  .replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi,'<footer style="padding:18px;text-align:center"><a href="https://wa.me/966543278747" style="color:#175b40">دعم العملاء</a></footer>')
}

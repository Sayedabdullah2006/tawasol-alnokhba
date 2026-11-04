'use client'

import { useState, type CSSProperties } from 'react'
import type { IndividualPackage } from '@/lib/individual-packages'
import styles from './PackageComparison.module.css'

type Props = { packages: IndividualPackage[]; selected: string | null; prices: Record<string, number | null>; availableChannels: string[]; onSelect: (id: string) => void }
export default function PackageComparison({ packages, selected, prices, availableChannels, onSelect }: Props) {
  const [mobileTable,setMobileTable]=useState(false),[active,setActive]=useState(selected ?? packages[0]?.id ?? '')
  const rows=[...new Map(packages.flatMap(p=>p.benefits).filter(b=>b.id!=='purpose').map(b=>[b.id,{id:b.id,label:b.label}])).values()]
  const usable=(p:IndividualPackage)=>p.channels?p.channels.every(c=>availableChannels.includes(c)):availableChannels.length>=p.channelCount
  const price=(p:IndividualPackage)=>prices[p.id]==null?'يُحسب بعد اختيار نوع الخبر':`${prices[p.id]!.toLocaleString('ar-SA')} ريال`
  const choose=(p:IndividualPackage)=><button type="button" className={`${styles.choose} ${selected===p.id?styles.chosen:''}`} disabled={!usable(p)||prices[p.id]==null} aria-pressed={selected===p.id} onClick={()=>{setActive(p.id);onSelect(p.id)}}>{!usable(p)?'غير متاحة لقنوات الناشر':selected===p.id?'الباقة المختارة':`اختيار ${p.name}`}</button>
  const value=(p:IndividualPackage,id:string)=>{
    const benefit=p.benefits.find(b=>b.id===id)
    return benefit?.included?<span className={styles.value}><span className={styles.check} aria-hidden="true">✓</span><span>{benefit.value}</span></span>:<span className={styles.excluded} role="img" aria-label="غير مشمول">×</span> // taste-skill-ignore: User-requested comparison indicator with accessible text.
  }
  const current=packages.find(p=>p.id===active)??packages.find(p=>p.id===selected)??packages[0]
  if(!current)return <p role="status">لا توجد باقة مناسبة لهذا الخبر حاليًا.</p>
  return <div className={styles.root} data-package-comparison>
    <div className={styles.toolbar}><p>الأسعار والمزايا المعروضة حسب نوع الخبر المختار.</p><button type="button" className={styles.mobileToggle} aria-pressed={mobileTable} onClick={()=>setMobileTable(v=>!v)}>{mobileTable?'عرض الباقات كبطاقات':'مقارنة الباقات في جدول'}</button></div>
    <div className={`${styles.tableArea} ${mobileTable?styles.showMobile:''}`} tabIndex={0} role="region" aria-label="جدول مقارنة الباقات" style={{'--comparison-width':`${(packages.length+1)*180}px`} as CSSProperties}>
      <table className={styles.table}>
        <caption className="sr-only">مقارنة أسعار الباقات ومزاياها؛ اختر باقة واحدة ثم أكمل القنوات والتفاصيل.</caption>
        <colgroup><col className={styles.labelColumn}/>{packages.map(p=><col key={p.id}/>)}</colgroup>
        <thead><tr><th scope="col">المزايا</th>{packages.map(p=><th scope="col" key={p.id} className={selected===p.id?styles.selected:''}><span className={styles.name}>{p.name}</span><strong className={styles.price}>{price(p)}</strong>{choose(p)}</th>)}</tr></thead>
        <tbody>{rows.map(row=><tr key={row.id} data-benefit-id={row.id}><th scope="row">{row.label}</th>{packages.map(p=><td key={p.id} className={selected===p.id?styles.selected:''}>{value(p,row.id)}</td>)}</tr>)}</tbody>
        <tfoot><tr><th scope="row">اختيار الباقة</th>{packages.map(p=><td key={p.id} className={selected===p.id?styles.selected:''}>{choose(p)}</td>)}</tr></tfoot>
      </table>
    </div>
    <div className={`${styles.mobileCards} ${mobileTable?styles.hideMobile:''}`}>
      <div className={styles.tabs} role="tablist" aria-label="استعراض الباقات">{packages.map(p=><button key={p.id} type="button" role="tab" id={`package-tab-${p.id}`} aria-selected={current.id===p.id} aria-controls="mobile-package-panel" tabIndex={current.id===p.id?0:-1} onClick={()=>setActive(p.id)} onKeyDown={event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=packages.findIndex(v=>v.id===current.id),next=event.key==='Home'?0:event.key==='End'?packages.length-1:(index+(event.key==='ArrowLeft'?1:-1)+packages.length)%packages.length;setActive(packages[next].id);document.getElementById(`package-tab-${packages[next].id}`)?.focus()}}}>{p.name}</button>)}</div>
      <section id="mobile-package-panel" role="tabpanel" aria-labelledby={`package-tab-${current.id}`} className={`${styles.card} ${selected===current.id?styles.selected:''}`}>
        <h3 className={styles.name}>{current.name}</h3><strong className={styles.price}>{price(current)}</strong>
        <dl>{rows.map(row=><div key={row.id} data-benefit-id={row.id}><dt>{row.label}</dt><dd>{value(current,row.id)}</dd></div>)}</dl>
        {choose(current)}
      </section>
    </div>
    <p className={styles.legend}><span aria-hidden="true">✓</span> مشمول <span aria-hidden="true">×</span> غير مشمول. تظهر الإضافات المتاحة في مراجعة الطلب.</p>{/* taste-skill-ignore: Legend for user-requested comparison indicators. */}
  </div>
}

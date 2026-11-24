'use client'

import { useId, useRef, useState } from 'react'
import type { IndividualPackage } from '@/lib/individual-packages'
import styles from './PackageComparison.module.css'

type Props = {
  packages: IndividualPackage[]
  selected: string | null
  prices: Record<string, number | null>
  availableChannels: string[]
  onSelect: (id: string) => void
}

const CHANNEL_NAMES: Record<string, string> = { x: 'X', li: 'LinkedIn', ig: 'Instagram', tk: 'TikTok' }

// Shorten known catalog wording only, so revised terms still display verbatim.
const comparisonLabels = new Map([
 ['فيديو أنا من أكون يسجله العميل وينشر في تيك توك ويوتيوب والموقع', 'فيديو أنا من أكون يسجله العميل وينشر'],
 ['كتابة النص وتصميم الخبر', 'النص وتصميم الخبر'],
 ['الإشارة إلى حساب العميل', 'الإشارة لحساب العميل'],
 ['عدد جولات التعديل قبل الاعتماد', 'جولات التعديل قبل الاعتماد'],
 ['إعداد حكاية في الموقع', 'حكاية في الموقع'],
 ['إعداد صفحة شخصية', 'صفحة شخصية'],
 ['منشور صور كاروسيل', 'منشور كاروسيل'],
 ['إبراز الخبر في غلاف الموقع', 'إبراز الخبر على الغلاف'],
 ['إبراز الشخصية في مكتبة الحكايات على الغلاف', 'إبراز الشخصية بمكتبة الحكايات على الغلاف'],
 ['ميزانية الإعلان الممول المشمولة', 'ميزانية الإعلان المشمولة'],
 ['جلسة جمع المعلومات المهنية', 'جلسة المعلومات المهنية'],
 ['إعداد السيرة الذاتية ATS', 'سيرة ذاتية ATS'],
 ['النشر في مواقع التوظيف', 'النشر بمواقع التوظيف'],
]);
const comparisonValues = new Map([
 ['نص عربي وتصميم مناسب للقنوات الأربع', 'نص عربي وتصميم لـ4 قنوات'],
 ['نص عربي وصورة بمقاسات القناتين', 'نص عربي وصورة للقناتين'],
 ['فيديو مدة دقيقة', 'فيديو لدقيقة'],
 ['صفحة خبر ورابط مباشر', 'صفحة خبر برابط مباشر'],
 ['صفحة شخصية وتحديث مرتين خلال 6 شهور', 'تحديثان خلال 6 أشهر'],
 ['صفحة شخصية وتحديث واحد خلال أول 60 يوم', 'تحديث خلال أول 60 يومًا'],
 ['مرة واحدة بعد 24 إلى 48 ساعة', 'مرة بعد 24 إلى 48 ساعة'],
 ['مرة واحدة للقصة المهنية', 'مرة للقصة المهنية'],
 ['لغة واحدة؛ تسليم وورد وبي دي إف', 'لغة واحدة، Word وPDF'],
 ['مقترحات لتطوير ظهور الحساب', 'مقترحات لتحسين الظهور'],
]);

export default function PackageComparison({ packages, selected, prices, availableChannels, onSelect }: Props) {
  const id = useId()
  const tabs = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(selected)
  const current = packages.find(pkg => pkg.id === active) ?? packages.find(pkg => pkg.id === selected) ?? packages[0]
  if (!current) return <p role="status">لا توجد باقة مناسبة لهذا الخبر حاليًا.</p>

  const rows = [...new Map(packages.flatMap(pkg => pkg.benefits)
    .filter(benefit => benefit.id !== 'purpose')
    .map(benefit => [benefit.id, { id: benefit.id, label: benefit.label }])).values()]

  function purpose(pkg: IndividualPackage) {
    return pkg.benefits.find(benefit => benefit.id === 'purpose')?.value || pkg.blurb
  }

  function priceBlock(pkg: IndividualPackage) {
    const price = prices[pkg.id]
    const channels = pkg.channels
      ? pkg.channels.map(channel => CHANNEL_NAMES[channel] ?? channel).join('، ')
      : pkg.benefits.find(benefit => benefit.id === 'channels')?.value
    return <div className={styles.priceBlock}>
      <strong className={styles.price}>
        {price == null ? 'يُحسب بعد اختيار نوع الخبر' : `${price.toLocaleString('ar-SA')} ر.س`}
      </strong>
      <span>{channels}</span>
    </div>
  }

  function choose(pkg: IndividualPackage) {
    const usable = pkg.channels
      ? pkg.channels.every(channel => availableChannels.includes(channel))
      : availableChannels.length >= pkg.channelCount
    return <button
      type="button"
      className={styles.choose}
      disabled={!usable || prices[pkg.id] == null}
      aria-pressed={selected === pkg.id}
      onClick={() => {
        setActive(pkg.id)
        onSelect(pkg.id)
      }}
    >
      {!usable ? 'غير متاحة لقنوات الناشر' : selected === pkg.id ? 'الباقة المختارة' : `اختيار ${pkg.name}`}
    </button>
  }

  function value(pkg: IndividualPackage, benefitId: string) {
    const benefit = pkg.benefits.find(item => item.id === benefitId)
    return benefit?.included
      ? <span className={styles.value}><span className={styles.check} aria-hidden="true">✓</span><span>{comparisonValues.get(benefit.value) ?? benefit.value}</span></span>
      : <span className={styles.excluded} role="img" aria-label="غير مشمول">×</span>
  }

  return <div className={styles.root} data-package-comparison>
    <div className={styles.tableArea}>
      <table className={styles.table}>
        <caption className="sr-only">مقارنة أسعار الباقات ومزاياها</caption>
        <colgroup><col className={styles.labelColumn} />{packages.map(pkg => <col key={pkg.id} />)}</colgroup>
        <thead>
          <tr>
            <th rowSpan={3} className={styles.key}>
              <strong>مقارنة الباقات</strong>
              <p>اختر الباقة المناسبة لنوع خبرك وقنوات النشر.</p>
            </th>
            {packages.map((pkg, index) => <th key={pkg.id} id={`${id}-column-${pkg.id}`} scope="col" data-tone={index} data-selected={selected === pkg.id} className={styles.plan}>
              <strong className={styles.name}>{pkg.name}</strong>
              <p>{purpose(pkg)}</p>
            </th>)}
          </tr>
          <tr>{packages.map((pkg, index) => <td key={pkg.id} headers={`${id}-column-${pkg.id}`} data-tone={index} data-selected={selected === pkg.id} className={styles.plan}>{priceBlock(pkg)}</td>)}</tr>
          <tr>{packages.map((pkg, index) => <td key={pkg.id} headers={`${id}-column-${pkg.id}`} data-tone={index} data-selected={selected === pkg.id} className={styles.plan}>{choose(pkg)}</td>)}</tr>
        </thead>
        <tbody>
          {rows.map(row => <tr key={row.id} data-benefit-id={row.id}>
            <th id={`${id}-row-${row.id}`} scope="row">{comparisonLabels.get(row.label) ?? row.label}</th>
            {packages.map(pkg => <td key={pkg.id} headers={`${id}-row-${row.id} ${id}-column-${pkg.id}`} data-selected={selected === pkg.id}>{value(pkg, row.id)}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
    <div className={styles.mobile}>
      <div ref={tabs} className={styles.tabs} role="tablist" aria-label="استعراض الباقات">
        {packages.map((pkg, index) => <button
          key={pkg.id}
          type="button"
          role="tab"
          id={`${id}-tab-${pkg.id}`}
          aria-selected={current.id === pkg.id}
          aria-controls={`${id}-panel`}
          tabIndex={current.id === pkg.id ? 0 : -1}
          onClick={() => setActive(pkg.id)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
            event.preventDefault()
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? packages.length - 1
              : (index + (event.key === 'ArrowLeft' ? 1 : -1) + packages.length) % packages.length
            setActive(packages[next].id)
            tabs.current?.querySelectorAll('button')[next]?.focus()
          }}
        >{pkg.name}</button>)}
      </div>
      <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${current.id}`} className={styles.card} data-selected={selected === current.id}>
        <div className={styles.plan} data-tone={packages.indexOf(current)} data-selected={selected === current.id}>
          <h3 className={styles.name}>{current.name}</h3>
          <p>{purpose(current)}</p>
          {priceBlock(current)}
          {choose(current)}
        </div>
        <dl>{rows.map(row => <div key={row.id} data-benefit-id={row.id}><dt>{comparisonLabels.get(row.label) ?? row.label}</dt><dd>{value(current, row.id)}</dd></div>)}</dl>
      </section>
    </div>
    <p className={styles.legend}>✓ مشمول بالقيمة الموضحة · × غير مشمول. ميزانية الإعلان المشمولة لا تُضاف مرة أخرى.</p>
  </div>
}

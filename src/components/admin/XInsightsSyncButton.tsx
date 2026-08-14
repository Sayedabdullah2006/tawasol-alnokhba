'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Button from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function XInsightsSyncButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const sync = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/admin/x-insights/sync', { method: 'POST' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data.error ?? 'تعذّرت مزامنة تحليلات X')
      showToast(`تم تحديث ${data.synced ?? 0} منشور من X`, 'success')
      router.refresh()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'تعذّرت مزامنة تحليلات X', 'error')
    } finally {
      setLoading(false)
    }
  }

  return <Button onClick={sync} loading={loading} disabled={disabled}>تحديث البيانات من X</Button>
}

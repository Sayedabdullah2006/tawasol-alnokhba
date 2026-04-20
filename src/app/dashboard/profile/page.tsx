'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import ProfileForm from '@/components/dashboard/ProfileForm'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

export default function ProfilePage() {
  const router = useRouter()
  const supabase = createClient()
  const [profile, setProfile] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/auth/login'); return }

      setEmail(user.email ?? '')

      const { data: prof } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      setProfile(prof)
      setLoading(false)
    }
    load()
  }, [router, supabase])

  if (loading) return <LoadingSpinner size="lg" />

  return (
    <div className="p-6 max-w-lg">
      <h1 className="text-2xl font-black text-dark mb-6">الملف الشخصي</h1>
      {profile && <ProfileForm profile={profile} email={email} />}
    </div>
  )
}

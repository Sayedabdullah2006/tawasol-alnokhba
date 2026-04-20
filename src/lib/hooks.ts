'use client'

import { useState, useEffect } from 'react'
import { createClient } from './supabase'

export interface DBCategory {
  id: string
  name_ar: string
  icon: string
  description: string | null
  has_sub_option: boolean
  sub_option_title: string | null
  sub_options: { id: string; icon: string; label: string; hint: string }[] | null
  client_types: string[] | null
  sort_order: number
  is_active: boolean
}

export interface DBExtra {
  id: string
  name_ar: string
  icon: string
  default_price: number
  category_only: string | null
  sort_order: number
  is_active: boolean
}

export function useCategories() {
  const [categories, setCategories] = useState<DBCategory[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setCategories((data as DBCategory[]) ?? [])
        setLoading(false)
      })
  }, [])

  return { categories, loading }
}

export function useExtras() {
  const [extras, setExtras] = useState<DBExtra[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('extras')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => {
        setExtras((data as DBExtra[]) ?? [])
        setLoading(false)
      })
  }, [])

  return { extras, loading }
}

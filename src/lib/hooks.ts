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

// ─── محتوى الموقع القابل للتعديل من لوحة الأدمن ───
// (الشروط والأحكام + شروط قبول الخبر العامة وبحسب الفئة)
// يُقرأ من جدول site_content؛ وعند فشل الجلب تُستخدم القيم الافتراضية في الكود.
export interface SiteContent {
  terms_text: string
  news_conditions_general: string[]
  news_conditions_footer: string
  category_conditions: Record<string, string>
}

export function useSiteContent(fallback: SiteContent) {
  const [content, setContent] = useState<SiteContent>(fallback)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('site_content')
      .select('terms_text, news_conditions_general, news_conditions_footer, category_conditions')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (!data) return
        setContent({
          terms_text: data.terms_text || fallback.terms_text,
          news_conditions_general: Array.isArray(data.news_conditions_general) && data.news_conditions_general.length
            ? data.news_conditions_general
            : fallback.news_conditions_general,
          news_conditions_footer: data.news_conditions_footer || fallback.news_conditions_footer,
          category_conditions:
            data.category_conditions && typeof data.category_conditions === 'object'
              ? data.category_conditions
              : fallback.category_conditions,
        })
      })
    // fallback ثابت من الكود — لا حاجة لإعادة الجلب عند تغيّره
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return content
}


'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { COMPETITION_SUBCATEGORIES, getCompetitionPositions } from '@/lib/constants'
import type { CompetitionSubcategory, CompetitionPosition } from '@/lib/constants'

interface StepCompetitionProps {
  selected: { subcategory: string; position: string } | null
  onSelect: (selection: { subcategory: string; position: string }) => void
}

export default function StepCompetition({ selected, onSelect }: StepCompetitionProps) {
  const [currentSubcategory, setCurrentSubcategory] = useState<string | null>(
    selected?.subcategory ?? null
  )
  const [showPositions, setShowPositions] = useState(!!selected?.subcategory)

  const handleSubcategorySelect = (subcategoryId: string) => {
    setCurrentSubcategory(subcategoryId)
    setShowPositions(true)
  }

  const handlePositionSelect = (positionId: string) => {
    if (currentSubcategory) {
      onSelect({ subcategory: currentSubcategory, position: positionId })
    }
  }

  const handleBack = () => {
    setShowPositions(false)
    setCurrentSubcategory(null)
  }

  const positions = currentSubcategory ? getCompetitionPositions(currentSubcategory) : []
  const selectedSubcategory = COMPETITION_SUBCATEGORIES.find(s => s.id === currentSubcategory)

  return (
    <div className="wizard-enter">
      {!showPositions ? (
        // Step 1: Competition Type Selection
        <>
          <h2 className="text-xl md:text-2xl font-black text-dark text-center mb-2">
            ما نوع المسابقة؟
          </h2>
          <p className="text-sm text-muted text-center mb-6">اختر نوع المسابقة التي شاركت فيها</p>

          <div className="grid grid-cols-1 gap-4 max-w-lg mx-auto">
            {COMPETITION_SUBCATEGORIES.map(subcategory => (
              <button
                key={subcategory.id}
                onClick={() => handleSubcategorySelect(subcategory.id)}
                className={cn(
                  'p-5 rounded-2xl border-2 text-center transition-all cursor-pointer',
                  'hover:shadow-md active:scale-[0.98]',
                  currentSubcategory === subcategory.id
                    ? 'border-green bg-green/5 shadow-md'
                    : 'border-border bg-card hover:border-green/30'
                )}
              >
                <div className="text-3xl mb-2">
                  {subcategory.id === 'international' ? '🌍' :
                   subcategory.id === 'local' ? '🏛️' : '💻'}
                </div>
                <h3 className="font-bold text-dark text-base mb-1">{subcategory.nameAr}</h3>
                <p className="text-xs text-muted">{subcategory.desc}</p>
              </button>
            ))}
          </div>
        </>
      ) : (
        // Step 2: Position Selection
        <>
          <div className="text-center mb-6">
            <button
              onClick={handleBack}
              className="text-green hover:underline text-sm mb-3 inline-flex items-center gap-1"
            >
              ← العودة لاختيار نوع المسابقة
            </button>
            <h2 className="text-xl md:text-2xl font-black text-dark mb-2">
              ما هو إنجازك في {selectedSubcategory?.nameAr}؟
            </h2>
            <p className="text-sm text-muted">اختر المركز أو الإنجاز الذي حققته</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl mx-auto">
            {positions.map(position => (
              <button
                key={position.id}
                onClick={() => handlePositionSelect(position.id)}
                className={cn(
                  'p-4 rounded-2xl border-2 text-center transition-all cursor-pointer',
                  'hover:shadow-md active:scale-[0.98] relative',
                  selected?.position === position.id
                    ? 'border-green bg-green/5 shadow-md'
                    : 'border-border bg-card hover:border-green/30'
                )}
              >
                <div className="text-2xl mb-2">
                  {position.id === 'first' ? '🥇' :
                   position.id === 'second' ? '🥈' :
                   position.id === 'third' ? '🥉' :
                   position.id === 'finalist' ? '🏆' :
                   position.id === 'top_10' ? '🔟' :
                   position.id === 'top_50' ? '🏅' : '⭐'}
                </div>
                <h3 className="font-bold text-dark text-sm mb-1">{position.nameAr}</h3>
                {position.multiplier > 1.0 && (
                  <div className="text-xs text-green font-medium">
                    +{Math.round((position.multiplier - 1) * 100)}% على السعر
                  </div>
                )}
                {position.multiplier === 1.0 && (
                  <div className="text-xs text-muted">السعر الأساسي</div>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
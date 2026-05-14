'use client'

interface Props {
  show: boolean
  text: string
}

export default function MicroAffirmation({ show, text }: Props) {
  if (!show) return null
  return (
    <div
      className="max-w-2xl mx-auto mt-5 flex items-center gap-2 justify-center text-sm text-green-700 bg-green/5 border border-green/20 rounded-xl px-4 py-2 wizard-enter"
      role="status"
    >
      <span className="text-base">✓</span>
      <span>{text}</span>
    </div>
  )
}

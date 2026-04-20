import Button from './Button'
import Link from 'next/link'

interface EmptyStateProps {
  title: string
  description?: string
  actionLabel?: string
  actionHref?: string
}

export default function EmptyState({ title, description, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="text-6xl mb-4 opacity-30">📭</div>
      <h3 className="text-lg font-bold text-dark mb-2">{title}</h3>
      {description && <p className="text-muted text-sm mb-6">{description}</p>}
      {actionLabel && actionHref && (
        <Link href={actionHref}>
          <Button>{actionLabel}</Button>
        </Link>
      )}
    </div>
  )
}

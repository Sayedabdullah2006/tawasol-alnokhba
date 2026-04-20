import { REQUEST_STATUSES, type RequestStatus } from '@/lib/constants'

export default function StatusBadge({ status }: { status: string }) {
  const config = REQUEST_STATUSES[status as RequestStatus] ?? { label: status, color: 'gray' }

  const colors: Record<string, string> = {
    yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    cyan: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    green: 'bg-green/5 text-green border-green/20',
    red: 'bg-red-50 text-red-700 border-red-200',
    gray: 'bg-gray-50 text-gray-700 border-gray-200',
  }

  return (
    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${colors[config.color]}`}>
      {config.label}
    </span>
  )
}

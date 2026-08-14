import InventorStoreWorkspace from '@/components/admin/InventorStoreWorkspace'

export default async function InventorStoreRequestWorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InventorStoreWorkspace requestId={id} />
}

'use client'
import { PilotMetrics } from '@/components/PilotMetrics'
import { useApp } from '../../app-context'
import { Alert, AlertDescription } from '@/components/ui/alert'

export default function PilotPage() {
  const { me } = useApp()
  if (!['owner','admin'].includes(me.member.role)) return <Alert><AlertDescription>Solo el propietario o un administrador puede revisar la medición del piloto.</AlertDescription></Alert>
  return <PilotMetrics />
}

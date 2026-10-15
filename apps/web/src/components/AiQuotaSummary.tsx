import type { AiQuotaSnapshot } from '@crm/shared'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'

export function AiQuotaSummary({ quota }: { quota: AiQuotaSnapshot }) {
  const reset = quota.resetsOn.split('-').reverse().join('/')
  return <Card><CardHeader><CardTitle>Consultas de IA del mes</CardTitle><CardDescription>Compartidas por todo el equipo de esta organización.</CardDescription></CardHeader><CardContent className="flex flex-col gap-2">
    <p><strong>{quota.used} de {quota.limit}</strong> consultas utilizadas · {quota.remaining} disponibles.</p>
    <p className="text-sm text-muted-foreground">Se renuevan el {reset}, a las 00:00 de Uruguay. Cada mensaje enviado al asistente consume una consulta, incluso si el proveedor falla o no llega a responder.</p>
    {quota.remaining === 0 && <p role="status">Agotaste las consultas del mes. Podés seguir editando y aplicando tu propuesta manualmente.</p>}
  </CardContent></Card>
}

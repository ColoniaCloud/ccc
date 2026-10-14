type Stage = { id: string; outcome: 'open' | 'won' | 'lost' }
type Pipeline = { id: string; stages: Stage[] }
type Deal = { stageId: string; pipelineId: string; currency: string; value: string }
export function commercialSummary(deals: Deal[], pipelines: Pipeline[]) {
  const openStages = new Set(pipelines.flatMap(p => p.stages.filter(s => s.outcome === 'open').map(s => s.id)))
  const open = deals.filter(d => openStages.has(d.stageId))
  return { openCount: open.length, usdPipeline: open.filter(d => d.currency === 'USD').reduce((sum, d) => sum + (Number(d.value) || 0), 0) }
}
export function pipelineSummary<T extends Stage>(deals: Deal[], pipeline: { id: string; stages: T[] } | undefined) {
  const selected = deals.filter(d => d.pipelineId === pipeline?.id)
  const counts = pipeline?.stages.map(stage => ({ ...stage, count: selected.filter(d => d.stageId === stage.id).length })) ?? []
  const maximum = Math.max(1, ...counts.map(s => s.count))
  return { count: selected.length, stages: counts.map(stage => ({ ...stage, width: `${Math.max(stage.count ? 12 : 2, stage.count / maximum * 100)}%` })) }
}

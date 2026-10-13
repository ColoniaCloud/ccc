export async function loadContactOptions(apiFetch: (path: string, init?: RequestInit) => Promise<Response>, signal?: AbortSignal) {
  const items: { id: string; name: string }[] = []
  for (let page = 1; ; page++) {
    const res = await apiFetch(`/api/contacts?pageSize=100&sort=name_asc&page=${page}`, { signal })
    const data = await res.json() as { items: { id: string; name: string }[]; total: number; error?: string }
    if (!res.ok) throw new Error(data.error ?? 'No se pudieron cargar los contactos')
    items.push(...data.items)
    if (items.length >= data.total || !data.items.length) return items
  }
}

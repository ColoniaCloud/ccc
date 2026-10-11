'use client'

import { useState } from 'react'
import type { BusinessProfile, BusinessSalesChannel } from '@crm/shared'
import {
  INDUSTRY_LABELS, COUNTRY_LABELS, TEAM_SIZE_LABELS,
  SALES_CHANNEL_LABELS, SALES_CYCLE_LABELS, GOAL_LABELS,
} from '@/lib/business-profile'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

export type BusinessProfileValues = {
  name:          string
  industry:      string
  industryOther: string
  country:       string
  teamSize:      string
  offering:      string
  salesChannels: BusinessSalesChannel[]
  averageTicket: string
  salesCycle:    string
  mainGoal:      string
}

export function toFormValues(name: string, profile: BusinessProfile | null): BusinessProfileValues {
  return {
    name,
    industry:      profile?.industry ?? '',
    industryOther: profile?.industryOther ?? '',
    country:       profile?.country ?? '',
    teamSize:      profile?.teamSize ?? '',
    offering:      profile?.offering ?? '',
    salesChannels: profile?.salesChannels ?? [],
    averageTicket: profile?.averageTicket ?? '',
    salesCycle:    profile?.salesCycle ?? '',
    mainGoal:      profile?.mainGoal ?? '',
  }
}

function SelectField(props: {
  id: string
  label: React.ReactNode
  value: string
  placeholder: string
  options: Record<string, string>
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <div className="auth-field">
      <Label htmlFor={props.id}>{props.label}</Label>
      <Select value={props.value || undefined} onValueChange={props.onChange} disabled={props.disabled}>
        <SelectTrigger id={props.id} className="w-full">
          <SelectValue placeholder={props.placeholder} />
        </SelectTrigger>
        <SelectContent position="popper">
          <SelectGroup>
            {Object.entries(props.options).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

const Optional = () => <span className="auth-optional"> (opcional)</span>

/**
 * Formulario "Datos del negocio": segundo paso del registro y
 * Configuración → Negocio. La validación real la hace la API
 * (apps/api/src/onboarding/business-profile.ts); acá solo lo mínimo para
 * no mandar el formulario incompleto.
 */
export function BusinessProfileForm(props: {
  initial:     BusinessProfileValues
  submitLabel: string
  readOnly?:   boolean
  onSubmit:    (values: BusinessProfileValues) => Promise<string | null>
}) {
  const [values,  setValues]  = useState(props.initial)
  const [error,   setError]   = useState<string | null>(null)
  const [saved,   setSaved]   = useState(false)
  const [loading, setLoading] = useState(false)
  const readOnly = props.readOnly ?? false

  function set<K extends keyof BusinessProfileValues>(key: K, value: BusinessProfileValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  function toggleChannel(channel: BusinessSalesChannel) {
    set('salesChannels', values.salesChannels.includes(channel)
      ? values.salesChannels.filter((c) => c !== channel)
      : [...values.salesChannels, channel])
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setSaved(false)

    if (!values.industry || !values.country || !values.teamSize) {
      setError('Completá rubro, país y tamaño del equipo.')
      return
    }

    setLoading(true)
    try {
      const submitError = await props.onSubmit(values)
      if (submitError) setError(submitError)
      else setSaved(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="auth-field">
        <Label htmlFor="bp-name">Nombre del negocio</Label>
        <Input
          id="bp-name" placeholder="Mi Empresa SRL" required minLength={2} maxLength={120}
          autoComplete="organization" disabled={readOnly}
          value={values.name} onChange={(e) => set('name', e.target.value)}
        />
      </div>

      <SelectField
        id="bp-industry" label="Rubro" placeholder="Elegí tu rubro"
        options={INDUSTRY_LABELS} value={values.industry} disabled={readOnly}
        onChange={(v) => set('industry', v)}
      />

      {values.industry === 'other' && (
        <div className="auth-field">
          <Label htmlFor="bp-industry-other">¿A qué se dedica tu negocio?</Label>
          <Input
            id="bp-industry-other" placeholder="Ej: vivero, estudio de arquitectura…" required maxLength={80}
            disabled={readOnly}
            value={values.industryOther} onChange={(e) => set('industryOther', e.target.value)}
          />
        </div>
      )}

      <SelectField
        id="bp-country" label="País" placeholder="Elegí el país"
        options={COUNTRY_LABELS} value={values.country} disabled={readOnly}
        onChange={(v) => set('country', v)}
      />

      <SelectField
        id="bp-team" label="Tamaño del equipo" placeholder="¿Cuántos son?"
        options={TEAM_SIZE_LABELS} value={values.teamSize} disabled={readOnly}
        onChange={(v) => set('teamSize', v)}
      />

      <div className="auth-field">
        <Label htmlFor="bp-offering">¿Qué vendés?</Label>
        <Textarea
          id="bp-offering" rows={3} required minLength={10} maxLength={500} disabled={readOnly}
          placeholder="Ej: polarizado de autos y láminas de seguridad para casas y comercios"
          value={values.offering} onChange={(e) => set('offering', e.target.value)}
        />
      </div>

      <div className="auth-field">
        <Label>¿Por dónde vendés?<Optional /></Label>
        <div className="auth-checks">
          {(Object.entries(SALES_CHANNEL_LABELS) as [BusinessSalesChannel, string][]).map(([channel, label]) => (
            <label key={channel} className="auth-check">
              <Checkbox
                checked={values.salesChannels.includes(channel)}
                disabled={readOnly}
                onCheckedChange={() => toggleChannel(channel)}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div className="auth-field">
        <Label htmlFor="bp-ticket">Ticket promedio<Optional /></Label>
        <Input
          id="bp-ticket" placeholder="Ej: USD 150" maxLength={80} disabled={readOnly}
          value={values.averageTicket} onChange={(e) => set('averageTicket', e.target.value)}
        />
      </div>

      <SelectField
        id="bp-cycle" label={<>¿Cuánto tarda en cerrarse una venta?<Optional /></>}
        placeholder="Elegí una opción" options={SALES_CYCLE_LABELS} value={values.salesCycle}
        disabled={readOnly} onChange={(v) => set('salesCycle', v)}
      />

      <SelectField
        id="bp-goal" label={<>¿Qué querés lograr con Plata?<Optional /></>}
        placeholder="Elegí tu objetivo principal" options={GOAL_LABELS} value={values.mainGoal}
        disabled={readOnly} onChange={(v) => set('mainGoal', v)}
      />

      {saved && (
        <Alert>
          <AlertDescription>Datos guardados.</AlertDescription>
        </Alert>
      )}

      {!readOnly && (
        <Button type="submit" className="mt-2 w-full" disabled={loading}>
          {loading ? 'Guardando…' : props.submitLabel}
        </Button>
      )}
    </form>
  )
}

/** Body para POST /api/onboarding y PUT /api/business-profile. */
export function toRequestBody(values: BusinessProfileValues) {
  return {
    name:          values.name,
    industry:      values.industry,
    industryOther: values.industryOther,
    country:       values.country,
    teamSize:      values.teamSize,
    offering:      values.offering,
    salesChannels: values.salesChannels,
    averageTicket: values.averageTicket,
    salesCycle:    values.salesCycle,
    mainGoal:      values.mainGoal,
  }
}

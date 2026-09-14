'use client'

import { useState } from 'react'
import Link from 'next/link'
import Papa from 'papaparse'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Tick02Icon,
  Upload01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons'
import type { CustomFieldType } from '@crm/shared'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useApp } from '../../app-context'

const MAX_ROWS = 500

const CRM_FIELDS = [
  { key: 'name', label: 'Nombre', required: true },
  { key: 'email', label: 'Email', required: false },
  { key: 'phone', label: 'Teléfono', required: false },
  { key: 'companyName', label: 'Empresa', required: false },
  { key: 'status', label: 'Estado', required: false },
  { key: 'tagNames', label: 'Etiquetas', required: false },
] as const

type FieldDefinition = {
  id: string
  key: string
  label: string
  fieldType: CustomFieldType
}

type ImportResult = {
  created: number
  updated: number
  skipped: { row: number; error: string }[]
}

const STEPS = [
  { number: 1, label: 'Archivo' },
  { number: 2, label: 'Columnas' },
  { number: 3, label: 'Revisión' },
  { number: 4, label: 'Resultado' },
] as const

export default function ContactsImportPage() {
  const { apiFetch } = useApp()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [parseError, setParseError] = useState<string | null>(null)
  const [columns, setColumns] = useState<string[]>([])
  const [rows, setRows] = useState<Record<string, string>[]>([])
  const [fileName, setFileName] = useState('')
  const [customFieldDefs, setCustomFieldDefs] = useState<FieldDefinition[] | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)

  async function loadCustomFieldDefs() {
    if (customFieldDefs) return
    const response = await apiFetch('/api/custom-fields?entityType=contact')
    const data = await response.json() as { items: FieldDefinition[] }
    setCustomFieldDefs(data.items)
  }

  function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    setParseError(null)
    setMapping({})

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data
        if (data.length === 0) {
          setParseError('El archivo no tiene filas para importar.')
          return
        }
        if (data.length > MAX_ROWS) {
          setParseError(
            `El archivo tiene ${data.length} filas. El máximo por importación es ${MAX_ROWS}; dividilo en partes más chicas.`,
          )
          return
        }
        setColumns(results.meta.fields ?? [])
        setRows(data)
        setFileName(file.name)
        loadCustomFieldDefs().catch(() => setParseError('No se pudieron cargar los campos personalizados.'))
        setStep(2)
      },
      error: () => setParseError('No se pudo leer el archivo CSV.'),
    })
  }

  function setMap(key: string, column: string) {
    setMapping((previous) => ({ ...previous, [key]: column === 'skip' ? '' : column }))
  }

  function buildPayload() {
    const get = (row: Record<string, string>, key: string) => {
      const column = mapping[key]
      return column ? row[column]?.trim() || undefined : undefined
    }

    return rows.map((row) => {
      const tagsColumn = mapping.tagNames
      const tagsCell = tagsColumn ? row[tagsColumn] : undefined
      const tagNames = tagsCell
        ? tagsCell.split(/[,;]/).map((value) => value.trim()).filter(Boolean)
        : undefined

      const customFields: Record<string, string> = {}
      for (const definition of customFieldDefs ?? []) {
        const column = mapping[`cf:${definition.key}`]
        const value = column ? row[column]?.trim() : undefined
        if (value) customFields[definition.key] = value
      }

      return {
        name: get(row, 'name'),
        email: get(row, 'email'),
        phone: get(row, 'phone'),
        companyName: get(row, 'companyName'),
        status: get(row, 'status'),
        tagNames,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
      }
    })
  }

  async function handleImport() {
    setImporting(true)
    setImportError(null)
    try {
      const response = await apiFetch('/api/contacts/import', {
        method: 'POST',
        body: JSON.stringify({ rows: buildPayload() }),
      })
      const data = await response.json().catch(() => null) as (ImportResult & { error?: string }) | null
      if (!response.ok) {
        throw new Error(data?.error ?? 'No se pudo importar el archivo.')
      }
      setResult(data)
      setStep(4)
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'No se pudo importar el archivo.')
    } finally {
      setImporting(false)
    }
  }

  const nameMapped = Boolean(mapping.name)
  const mappedCount = Object.values(mapping).filter(Boolean).length

  return (
    <div className="page import-page">
      <div className="page-header import-page-header">
        <div>
          <Button asChild variant="ghost" size="sm" className="back-button">
            <Link href="/app/contacts">
              <HugeiconsIcon data-icon="inline-start" icon={ArrowLeft01Icon} strokeWidth={2} />
              Contactos
            </Link>
          </Button>
          <h1>Importar contactos</h1>
          <p>Convertí un CSV en contactos listos para trabajar, sin crear duplicados por email.</p>
        </div>
        {fileName && <Badge variant="secondary">{fileName}</Badge>}
      </div>

      <ol className="import-steps" aria-label="Progreso de la importación">
        {STEPS.map((item) => {
          const complete = step > item.number
          const active = step === item.number
          return (
            <li
              key={item.number}
              className="import-step"
              data-active={active || undefined}
              data-complete={complete || undefined}
              aria-current={active ? 'step' : undefined}
            >
              <span className="import-step-number">
                {complete
                  ? <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.2} />
                  : item.number}
              </span>
              <span>{item.label}</span>
            </li>
          )
        })}
      </ol>

      {step === 1 && (
        <Card className="import-card">
          <CardHeader>
            <CardTitle>Seleccioná el archivo</CardTitle>
            <CardDescription>La primera fila debe contener los nombres de las columnas.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(parseError)}>
                <FieldLabel htmlFor="csv-file" className="import-dropzone">
                  <span className="import-upload-icon">
                    <HugeiconsIcon icon={Upload01Icon} strokeWidth={1.8} />
                  </span>
                  <span className="import-dropzone-copy">
                    <strong>Elegí un archivo CSV</strong>
                    <span>Hasta {MAX_ROWS} filas por importación</span>
                  </span>
                  <Input id="csv-file" type="file" accept=".csv,text/csv" onChange={handleFile} />
                </FieldLabel>
                <FieldDescription>Formato .csv con encabezados; los separadores por coma y punto y coma son compatibles.</FieldDescription>
                {parseError && <FieldError>{parseError}</FieldError>}
              </Field>
            </FieldGroup>
          </CardContent>
          <CardFooter className="import-card-footer import-tip">
            <span className="import-tip-icon">1</span>
            <span>Podrás decidir qué columnas importar antes de guardar cualquier dato.</span>
          </CardFooter>
        </Card>
      )}

      {step === 2 && (
        <Card className="import-card import-card-wide">
          <CardHeader>
            <CardTitle>Relacioná las columnas</CardTitle>
            <CardDescription>
              Detectamos {rows.length} {rows.length === 1 ? 'fila' : 'filas'} y {columns.length} {columns.length === 1 ? 'columna' : 'columnas'} en {fileName}.
            </CardDescription>
          </CardHeader>
          <CardContent className="import-mapping-content">
            <div className="import-mapping-heading" aria-hidden="true">
              <span>Campo en Colonia Cloud</span>
              <span>Columna del CSV</span>
            </div>
            <FieldGroup className="import-mapping-list">
              {CRM_FIELDS.map((field) => (
                <Field key={field.key} orientation="horizontal" className="import-mapping-row">
                  <div className="import-field-copy">
                    <FieldLabel htmlFor={`map-${field.key}`}>
                      {field.label}
                      {field.required && <Badge variant="secondary">Obligatorio</Badge>}
                    </FieldLabel>
                    {field.key === 'status' && <FieldDescription>Lead, Prospecto, Cliente o Inactivo</FieldDescription>}
                    {field.key === 'tagNames' && <FieldDescription>Separadas por coma o punto y coma</FieldDescription>}
                  </div>
                  <Select value={mapping[field.key] || 'skip'} onValueChange={(value) => setMap(field.key, value)}>
                    <SelectTrigger id={`map-${field.key}`} className="import-column-select" aria-invalid={field.required && !nameMapped}>
                      <SelectValue placeholder="No importar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="skip">No importar</SelectItem>
                        {columns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}

              {(customFieldDefs ?? []).map((definition) => (
                <Field key={definition.id} orientation="horizontal" className="import-mapping-row">
                  <div className="import-field-copy">
                    <FieldLabel htmlFor={`map-cf-${definition.key}`}>{definition.label}</FieldLabel>
                    <FieldDescription>Campo personalizado · {definition.fieldType}</FieldDescription>
                  </div>
                  <Select
                    value={mapping[`cf:${definition.key}`] || 'skip'}
                    onValueChange={(value) => setMap(`cf:${definition.key}`, value)}
                  >
                    <SelectTrigger id={`map-cf-${definition.key}`} className="import-column-select">
                      <SelectValue placeholder="No importar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="skip">No importar</SelectItem>
                        {columns.map((column) => <SelectItem key={column} value={column}>{column}</SelectItem>)}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
              ))}
            </FieldGroup>
            {!nameMapped && (
              <Alert variant="destructive">
                <AlertDescription>Mapeá la columna de Nombre para continuar.</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="import-card-footer">
            <Button variant="outline" onClick={() => setStep(1)}>
              <HugeiconsIcon data-icon="inline-start" icon={ArrowLeft01Icon} strokeWidth={2} />
              Atrás
            </Button>
            <div className="import-footer-status">
              <span>{mappedCount} {mappedCount === 1 ? 'campo mapeado' : 'campos mapeados'}</span>
              <Button disabled={!nameMapped} onClick={() => setStep(3)}>
                Continuar
                <HugeiconsIcon data-icon="inline-end" icon={ArrowRight01Icon} strokeWidth={2} />
              </Button>
            </div>
          </CardFooter>
        </Card>
      )}

      {step === 3 && (
        <Card className="import-card">
          <CardHeader>
            <CardTitle>Revisá antes de importar</CardTitle>
            <CardDescription>Ningún dato se guardará hasta que confirmes esta operación.</CardDescription>
          </CardHeader>
          <CardContent className="import-review">
            <div className="import-review-summary">
              <div className="import-review-icon">
                <HugeiconsIcon icon={UserGroupIcon} strokeWidth={1.8} />
              </div>
              <div>
                <strong>{rows.length} {rows.length === 1 ? 'contacto' : 'contactos'}</strong>
                <span>desde {fileName}</span>
              </div>
              <Badge variant="secondary">{mappedCount} campos</Badge>
            </div>
            <Alert>
              <AlertTitle>Control de duplicados</AlertTitle>
              <AlertDescription>
                Si el email coincide con un contacto existente, actualizaremos ese registro en lugar de crear uno nuevo.
              </AlertDescription>
            </Alert>
            {importError && (
              <Alert variant="destructive">
                <AlertTitle>No pudimos completar la importación</AlertTitle>
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="import-card-footer">
            <Button variant="outline" onClick={() => setStep(2)} disabled={importing}>
              <HugeiconsIcon data-icon="inline-start" icon={ArrowLeft01Icon} strokeWidth={2} />
              Atrás
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              <HugeiconsIcon data-icon="inline-start" icon={Upload01Icon} strokeWidth={2} />
              {importing ? 'Importando…' : 'Importar contactos'}
            </Button>
          </CardFooter>
        </Card>
      )}

      {step === 4 && result && (
        <Card className="import-card import-result-card">
          <CardHeader className="import-result-header">
            <div className="import-result-mark">
              <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.2} />
            </div>
            <CardTitle>Importación terminada</CardTitle>
            <CardDescription>Los contactos disponibles ya aparecen en tu directorio.</CardDescription>
          </CardHeader>
          <CardContent className="import-result-content">
            <div className="import-result-metrics">
              <div><strong>{result.created}</strong><span>Creados</span></div>
              <div><strong>{result.updated}</strong><span>Actualizados</span></div>
              <div><strong>{result.skipped.length}</strong><span>Omitidos</span></div>
            </div>
            {result.skipped.length > 0 && (
              <div className="import-skipped">
                <h2>Filas que requieren atención</h2>
                <ul>
                  {result.skipped.map((item, index) => (
                    <li key={`${item.row}-${index}`}>
                      <Badge variant="outline">Fila {item.row}</Badge>
                      <span>{item.error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
          <CardFooter className="import-card-footer import-result-footer">
            <Button asChild>
              <Link href="/app/contacts">
                Ver contactos
                <HugeiconsIcon data-icon="inline-end" icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}

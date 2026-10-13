import { describe, expect, it, vi } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { AnthropicSetupAssistant, assistantSystem, type AssistantContext } from '../anthropic'

const context: AssistantContext = { name: 'Automotora de prueba', profile: { version: 1, industry: 'automotive', industryOther: null, country: 'UY', teamSize: '2-5', offering: 'Venta de vehículos propios y consignados.', salesChannels: ['whatsapp'], averageTicket: null, salesCycle: 'weeks', mainGoal: 'follow_up' }, messages: [{ role: 'user', text: 'Prepará la propuesta' }], proposal: null }
const turn = { reply: 'Revisá la propuesta.', proposal: { summary: 'Venta de vehículos con seguimiento de compradores.', presets: ['automotive_sales'], recommendations: ['Cargar los vehículos'], connections: [{ tool: 'WhatsApp', purpose: 'Seguimiento pendiente de conexión' }] } }
function provider(response: unknown) {
  const create = vi.fn().mockResolvedValue(response)
  return { create, assistant: new AnthropicSetupAssistant('test-model', { messages: { create } } as unknown as Pick<Anthropic,'messages'>) }
}
const response = { stop_reason: 'tool_use', content: [{ type: 'tool_use', name: 'responder_onboarding', input: turn }], usage: { input_tokens: 123, output_tokens: 456 } }
describe('protocolo de Anthropic y contexto del producto', () => {
  it('acepta una respuesta estructurada y registra uso; el modelo no tiene herramientas para ejecutar cambios', async () => {
    const { assistant, create } = provider(response)
    expect(await assistant.generate(context)).toEqual({ turn, inputTokens: 123, outputTokens: 456 })
    const request = create.mock.calls[0]![0]
    expect(request.model).toBe('test-model')
    expect(request.messages).toEqual([{ role: 'user', content: 'Prepará la propuesta' }])
    expect(request.tools.map((tool: {name: string})=>tool.name)).toEqual(['responder_onboarding'])
    expect(request.tool_choice).toEqual({ type: 'tool', name: 'responder_onboarding' })
  })
  it('rechaza texto sin herramienta, respuestas truncadas, múltiples llamadas y plantillas ajenas al nicho', async () => {
    for(const invalid of [
      {...response, content:[{type:'text',text:JSON.stringify(turn)}]},
      {...response, stop_reason:'max_tokens'},
      {...response, content:[...response.content,...response.content]},
      {...response, content:[{type:'tool_use',name:'execute_sql',input:turn}]},
      {...response, content:[{type:'tool_use',name:'responder_onboarding',input:{...turn,proposal:{...turn.proposal,presets:['real_estate_sale']}}}]},
    ]) await expect(provider(invalid).assistant.generate(context)).rejects.toThrow()
  })
  it('incluye atributos de las fichas además de campos de contactos y evita prometer conexiones o citas automáticas', () => {
    const prompt=assistantSystem(context)
    expect(prompt).toContain('origen propio o consignado')
    expect(prompt).toContain('mover una oportunidad de etapa no crea una cita automáticamente')
    expect(prompt).toContain('No conectás herramientas')
    expect(prompt).toContain('No pidas contraseñas')
    expect(prompt).toContain('No son campos de la oportunidad')
    expect(prompt).toContain('Una tarea vinculada a una oportunidad debe tener fecha')
    expect(prompt).toContain('cada usuario debe autorizarlo')
  })
})

import { describe, it, expect } from 'vitest'
import { dailyFocus, appointmentIsPast } from '@crm/shared'
const now = new Date('2026-10-14T01:00:00Z')
describe('Tu día en hora de Uruguay', () => {
  it('separa días, responsables y tareas completadas sin ocultar las tareas sin fecha', () => {
    const tasks = [{id:'old',assignedTo:'me',done:false,dueOn:'2026-10-12'},{id:'today',assignedTo:'me',done:false,dueOn:'2026-10-13'},{id:'future',assignedTo:'me',done:false,dueOn:'2026-10-14'},{id:'undated',assignedTo:null,done:false,dueOn:null},{id:'done',assignedTo:'me',done:true,dueOn:'2026-10-12'}]
    const data = {tasks,appointments:[],followUp:[]}, mine = dailyFocus(data,'me',now)
    expect(mine.today).toBe('2026-10-13'); expect(mine.lastDay).toBe('2026-10-19')
    expect(mine.overdueTasks.map(t=>t.id)).toEqual(['old']); expect(mine.todayTasks.map(t=>t.id)).toEqual(['today']); expect(mine.undatedTasks).toHaveLength(0)
    expect(dailyFocus(data,'none',now).undatedTasks.map(t=>t.id)).toEqual(['undated']); expect(dailyFocus(data,'all',now).undatedTasks).toHaveLength(1)
  })
  it('una cita en curso no está vencida hasta que termine y limita próximas a siete días locales', () => {
    const appointments = [{id:'ongoing',assignedTo:'me',status:'scheduled',scheduledAt:'2026-10-14T00:30:00Z',durationMinutes:60},{id:'past',assignedTo:'me',status:'scheduled',scheduledAt:'2026-10-14T00:00:00Z',durationMinutes:60},{id:'cancelled',assignedTo:'me',status:'cancelled',scheduledAt:'2026-10-14T00:30:00Z',durationMinutes:60},{id:'boundary',assignedTo:'me',status:'scheduled',scheduledAt:'2026-10-20T02:00:00Z',durationMinutes:60},{id:'later',assignedTo:'me',status:'scheduled',scheduledAt:'2026-10-20T03:00:00Z',durationMinutes:60}]
    const focus = dailyFocus({tasks:[],appointments,followUp:[]},'me',now)
    expect(focus.overdueAppointments.map(a=>a.id)).toEqual(['past']); expect(focus.upcomingAppointments.map(a=>a.id)).toEqual(['ongoing','boundary'])
    expect(appointmentIsPast(appointments[0]!,new Date('2026-10-14T01:30:00Z'))).toBe(true)
  })
  it('los filtros también se aplican a oportunidades sin próximo paso', () => {
    const followUp = [{id:'mine',assignedTo:'me',needsFollowUp:true},{id:'planned',assignedTo:'me',needsFollowUp:false},{id:'other',assignedTo:'other',needsFollowUp:true},{id:'none',assignedTo:null,needsFollowUp:true}]
    expect(dailyFocus({tasks:[],appointments:[],followUp},'me',now).withoutFollowUp.map(d=>d.id)).toEqual(['mine'])
    expect(dailyFocus({tasks:[],appointments:[],followUp},'all',now).withoutFollowUp).toHaveLength(3)
  })
})

import { describe, it, expect } from 'vitest'
import { decideAccountDeletion } from '../deletion'

const solo = { role: 'admin', otherMembers: 0, otherAdmins: 0 }

describe('decideAccountDeletion', () => {
  it('el propietario debe transferir antes de borrar su cuenta aunque haya otros admins', () => {
    const result = decideAccountDeletion({ membership: { role: 'owner', otherMembers: 2, otherAdmins: 1 },
      organizationName: 'Acme', hasPaidSubscription: false })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/Transferí/)
  })
  it('sin organización borra solo el usuario', () => {
    expect(decideAccountDeletion({ membership: null, organizationName: null, hasPaidSubscription: false }))
      .toEqual({ allowed: true, deletesOrganization: false, organizationName: null })
  })

  it('único miembro: borra también la organización', () => {
    expect(decideAccountDeletion({ membership: solo, organizationName: 'Acme', hasPaidSubscription: false }))
      .toEqual({ allowed: true, deletesOrganization: true, organizationName: 'Acme' })
  })

  it('único miembro con suscripción paga: hay que cancelarla primero', () => {
    const result = decideAccountDeletion({ membership: solo, organizationName: 'Acme', hasPaidSubscription: true })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/Facturación/)
  })

  it('único admin con otros miembros: tiene que dejar otro admin', () => {
    const result = decideAccountDeletion({
      membership: { role: 'admin', otherMembers: 2, otherAdmins: 0 },
      organizationName: 'Acme',
      hasPaidSubscription: true,
    })
    expect(result.allowed).toBe(false)
    if (!result.allowed) expect(result.reason).toMatch(/único admin/)
  })

  it('con otro admin o como vendedor: se va sin borrar la organización', () => {
    expect(decideAccountDeletion({
      membership: { role: 'admin', otherMembers: 2, otherAdmins: 1 },
      organizationName: 'Acme',
      hasPaidSubscription: true,
    })).toEqual({ allowed: true, deletesOrganization: false, organizationName: 'Acme' })

    expect(decideAccountDeletion({
      membership: { role: 'seller', otherMembers: 1, otherAdmins: 1 },
      organizationName: 'Acme',
      hasPaidSubscription: false,
    })).toEqual({ allowed: true, deletesOrganization: false, organizationName: 'Acme' })
  })
})

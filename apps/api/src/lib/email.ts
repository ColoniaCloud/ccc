/**
 * Envío de correos transaccionales vía Resend (API HTTP directa, sin SDK).
 *
 * Sin RESEND_API_KEY (desarrollo local) no se envía nada: se loguea el
 * correo, con sus links, para poder seguir el flujo desde la consola.
 * En producción la falta de la key es un error de configuración y se lanza:
 * Better Auth lo propaga y el usuario ve que algo falló, en vez de quedar
 * esperando un correo que nunca va a llegar.
 */

const RESEND_URL = 'https://api.resend.com/emails'

export type EmailMessage = {
  to:      string
  subject: string
  html:    string
  text:    string
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  const from   = process.env.EMAIL_FROM ?? 'Plata <no-responder@plata.studio>'

  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('RESEND_API_KEY no está definida: no se pueden enviar correos')
    }
    console.info(`[email:dev] Para: ${message.to}\nAsunto: ${message.subject}\n\n${message.text}`)
    return
  }

  const res = await fetch(RESEND_URL, {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error(`Resend respondió ${res.status} al enviar "${message.subject}" a ${message.to}: ${detail}`)
    throw new Error('No se pudo enviar el correo')
  }
}

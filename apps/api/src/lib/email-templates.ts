import type { EmailMessage } from './email'

/**
 * Plantillas de los correos de autenticación. HTML con estilos en línea
 * (los clientes de correo ignoran <style>) y versión en texto plano.
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function layout(params: { title: string; intro: string; cta: string; url: string; outro: string }): string {
  const url = escapeHtml(params.url)
  return `<!doctype html>
<html lang="es">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:12px;padding:32px">
          <tr><td>
            <p style="margin:0 0 24px;font-size:20px;font-weight:700;letter-spacing:-0.02em">Plata</p>
            <h1 style="margin:0 0 12px;font-size:20px;line-height:1.3">${params.title}</h1>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#3f3f46">${params.intro}</p>
            <p style="margin:0 0 24px">
              <a href="${url}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:15px;font-weight:600">${params.cta}</a>
            </p>
            <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#71717a">Si el botón no funciona, copiá este link en tu navegador:</p>
            <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all"><a href="${url}" style="color:#3f3f46">${url}</a></p>
            <p style="margin:0;font-size:13px;line-height:1.6;color:#71717a">${params.outro}</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

export function organizationInvitationEmail(params: { to: string; organizationName: string; inviterName: string; url: string }): EmailMessage {
  const intro = `${params.inviterName} te invitó a trabajar en ${params.organizationName} en Plata.`
  return {
    to: params.to,
    subject: `Invitación a ${params.organizationName} en Plata`,
    html: layout({ title: 'Sumate al equipo', intro: escapeHtml(intro), cta: 'Ver invitación', url: params.url,
      outro: 'El link vence en 7 días. Ingresá o registrate con el email que recibió este correo. Si no esperabas esta invitación, ignorala.' }),
    text: `${intro}\n\n${params.url}\n\nIngresá o registrate con ${params.to}. El link vence en 7 días.`,
  }
}

export function verificationEmail(params: { to: string; name: string; url: string }): EmailMessage {
  const name = params.name.trim().split(/\s+/)[0] ?? ''
  return {
    to:      params.to,
    subject: 'Confirmá tu email para empezar a usar Plata',
    html: layout({
      title: `Hola${name ? ` ${escapeHtml(name)}` : ''}, confirmá tu email`,
      intro: 'Gracias por registrarte en Plata. Confirmá que este email es tuyo para activar tu cuenta.',
      cta:   'Confirmar email',
      url:   params.url,
      outro: 'El link vence en 24 horas. Si no creaste una cuenta en Plata, ignorá este correo.',
    }),
    text: [
      `Hola${name ? ` ${name}` : ''}, confirmá tu email para activar tu cuenta de Plata:`,
      '',
      params.url,
      '',
      'El link vence en 24 horas. Si no creaste una cuenta en Plata, ignorá este correo.',
    ].join('\n'),
  }
}

export function resetPasswordEmail(params: { to: string; url: string }): EmailMessage {
  return {
    to:      params.to,
    subject: 'Restablecé tu contraseña de Plata',
    html: layout({
      title: 'Restablecé tu contraseña',
      intro: 'Recibimos un pedido para cambiar la contraseña de tu cuenta de Plata.',
      cta:   'Elegir una contraseña nueva',
      url:   params.url,
      outro: 'El link vence en 1 hora. Si no pediste el cambio, ignorá este correo: tu contraseña sigue siendo la misma.',
    }),
    text: [
      'Recibimos un pedido para cambiar la contraseña de tu cuenta de Plata. Elegí una nueva desde este link:',
      '',
      params.url,
      '',
      'El link vence en 1 hora. Si no pediste el cambio, ignorá este correo.',
    ].join('\n'),
  }
}

export function deleteAccountEmail(params: { to: string; url: string; organizationName: string | null; deletesOrganization: boolean }): EmailMessage {
  const what = params.deletesOrganization && params.organizationName
    ? `tu cuenta y las organizaciones donde sos el único miembro: «${params.organizationName}», con todos sus datos (contactos, oportunidades, tareas y configuración)`
    : 'tu cuenta'
  return {
    to:      params.to,
    subject: 'Confirmá la eliminación de tu cuenta de Plata',
    html: layout({
      title: 'Confirmá la eliminación de tu cuenta',
      intro: `Pediste eliminar ${escapeHtml(what)}. Esta acción no se puede deshacer.`,
      cta:   'Revisar y confirmar',
      url:   params.url,
      outro: 'El link vence en 1 hora y tenés que abrirlo en un navegador donde hayas iniciado sesión en Plata. Si no lo pediste, ignorá este correo y cambiá tu contraseña: tu cuenta sigue igual.',
    }),
    text: [
      `Pediste eliminar ${what}. Esta acción no se puede deshacer.`,
      '',
      'Para confirmar, abrí este link en un navegador donde hayas iniciado sesión en Plata:',
      params.url,
      '',
      'El link vence en 1 hora. Si no lo pediste, ignorá este correo y cambiá tu contraseña.',
    ].join('\n'),
  }
}

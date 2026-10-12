import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL, LegalPage, ContactEmail } from '../legal'

export const metadata: Metadata = {
  title: 'Condiciones del servicio — Plata',
  description: 'Condiciones de uso de Plata, el CRM para equipos de ventas.',
}

export default function CondicionesServicioPage() {
  return (
    <LegalPage
      title="Condiciones del servicio"
      intro={
        <p>
          Estas condiciones regulan el uso de {LEGAL.service} ({LEGAL.site}), un servicio desarrollado por {LEGAL.owner},
          de {LEGAL.ownerPerson} (RUT {LEGAL.rut}). Al crear una cuenta o usar el servicio las aceptás. Si las aceptás en
          nombre de una empresa, declarás que tenés facultades para obligarla.
        </p>
      }
    >
      <h2>1. El servicio</h2>
      <p>
        {LEGAL.service} es un CRM en la nube para organizar contactos, oportunidades de venta, tareas y equipos. Podemos
        mejorar, cambiar o discontinuar funciones; si un cambio afecta de forma importante lo que contrataste, te
        avisamos con anticipación razonable.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Tenés que ser mayor de 18 años y dar datos verdaderos, incluido un email que sea tuyo.</li>
        <li>Sos responsable de mantener la confidencialidad de tu contraseña y de lo que se haga desde tu cuenta.</li>
        <li>
          Quien crea una organización es su administrador y decide qué miembros tienen acceso y con qué permisos.
        </li>
        <li>Avisanos de inmediato a <ContactEmail /> si sospechás un uso no autorizado.</li>
      </ul>

      <h2>3. Planes y pagos</h2>
      <ul>
        <li>
          Hay un plan gratuito y planes pagos con distintas funciones y límites, descritos en{' '}
          <Link href="/precios">Precios</Link>.
        </li>
        <li>
          Los planes pagos son suscripciones que se renuevan automáticamente por el mismo período hasta que las
          canceles. Los pagos se procesan a través de Mercado Pago o NOWPayments, según el medio que elijas.
        </li>
        <li>
          Podés cancelar en cualquier momento; la cancelación rige al final del período ya pagado y no genera
          reembolsos por períodos parciales, salvo que la ley disponga otra cosa.
        </li>
        <li>
          Podemos cambiar los precios avisándote con al menos 30 días de anticipación; el nuevo precio se aplica desde
          la siguiente renovación.
        </li>
        <li>Si un pago no se puede cobrar, podemos pasar tu organización al plan gratuito o suspenderla.</li>
      </ul>

      <h2>4. Uso aceptable</h2>
      <p>No podés usar {LEGAL.service} para:</p>
      <ul>
        <li>Actividades ilegales, fraudulentas o que vulneren derechos de terceros.</li>
        <li>Enviar spam o comunicaciones no solicitadas a contactos que no dieron su consentimiento.</li>
        <li>Cargar datos personales sin tener la base legal necesaria para tratarlos.</li>
        <li>Intentar acceder a datos de otras organizaciones, vulnerar la seguridad o sobrecargar el servicio.</li>
        <li>Copiar, revender o hacer ingeniería inversa del servicio.</li>
      </ul>
      <p>Si se incumplen estas reglas podemos suspender o cerrar la cuenta.</p>

      <h2>5. Tus datos</h2>
      <p>
        La información que cargás en {LEGAL.service} es tuya o de tu organización. Nos das permiso para guardarla y
        procesarla solo con el fin de prestarte el servicio. Cómo tratamos los datos personales está explicado en la{' '}
        <Link href="/pdp">Política de privacidad</Link>. Podés pedirnos una copia de tus datos mientras tu cuenta esté
        activa.
      </p>

      <h2>6. Propiedad intelectual</h2>
      <p>
        El software, la marca {LEGAL.service} y los contenidos del sitio pertenecen a {LEGAL.owner}. Te damos una
        licencia de uso personal, no exclusiva e intransferible, mientras tengas una cuenta activa.
      </p>

      <h2>7. Disponibilidad y responsabilidad</h2>
      <p>
        Trabajamos para que el servicio esté disponible y seguro, pero se presta &laquo;tal cual&raquo; y puede tener
        interrupciones por mantenimiento o causas ajenas a nosotros. En la medida permitida por la ley, {LEGAL.owner} no
        responde por lucro cesante, pérdida de datos causada por terceros ni daños indirectos, y su responsabilidad total
        se limita al monto que hayas pagado por el servicio en los 12 meses anteriores al hecho.
      </p>

      <h2>8. Terminación</h2>
      <p>
        Podés dejar de usar {LEGAL.service} y pedir la eliminación de tu cuenta cuando quieras. Nosotros podemos
        terminar o suspender el servicio por incumplimiento de estas condiciones, o discontinuarlo avisándote con al
        menos 30 días de anticipación para que puedas descargar tu información.
      </p>

      <h2>9. Cambios en las condiciones</h2>
      <p>
        Podemos modificar estas condiciones. Si los cambios son relevantes te avisamos por email o dentro de la
        aplicación antes de que entren en vigencia; seguir usando el servicio después implica aceptarlos.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Estas condiciones se rigen por las leyes de la {LEGAL.country}. Cualquier controversia se someterá a los
        tribunales competentes de la {LEGAL.country}, sin perjuicio de los derechos que te otorguen las normas de
        defensa del consumidor.
      </p>

      <h2>11. Contacto</h2>
      <p>Para cualquier consulta sobre estas condiciones escribinos a <ContactEmail />.</p>
    </LegalPage>
  )
}

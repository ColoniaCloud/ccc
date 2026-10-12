import type { Metadata } from 'next'
import Link from 'next/link'
import { LEGAL, LegalPage, ContactEmail } from '../legal'

export const metadata: Metadata = {
  title: 'Política de privacidad — Plata',
  description: 'Cómo Plata recolecta, usa y protege tus datos personales.',
}

export default function PoliticaPrivacidadPage() {
  return (
    <LegalPage
      title="Política de privacidad"
      intro={
        <p>
          Esta política explica qué datos personales trata {LEGAL.service} ({LEGAL.site}), para qué los usa,
          con quién los comparte y cómo podés ejercer tus derechos. Se rige por la Ley N.º 18.331 de
          Protección de Datos Personales y su Decreto reglamentario N.º 414/009 de la {LEGAL.country}.
        </p>
      }
    >
      <h2>1. Responsable</h2>
      <p>
        El responsable de la base de datos es {LEGAL.owner}, de {LEGAL.ownerPerson} (RUT {LEGAL.rut}),
        con domicilio en la {LEGAL.country}. Para cualquier consulta sobre tus datos escribinos a <ContactEmail />.
      </p>

      <h2>2. Qué datos tratamos</h2>
      <ul>
        <li>
          <strong>Datos de tu cuenta:</strong> nombre, email y contraseña (guardada cifrada, nunca en texto plano).
          Si entrás con Google o Microsoft, recibimos de ese proveedor tu nombre, email y foto de perfil.
        </li>
        <li>
          <strong>Datos de tu negocio:</strong> nombre, rubro, país, tamaño del equipo, qué vendés, canales de venta,
          ticket promedio, ciclo de venta y objetivos, que cargás al registrarte o en Configuración.
        </li>
        <li>
          <strong>Datos que cargás en el CRM:</strong> contactos, oportunidades, tareas, etiquetas, notas y archivos
          de tus clientes y prospectos (ver sección 6).
        </li>
        <li>
          <strong>Datos de facturación:</strong> plan contratado y estado de la suscripción. Los datos de tu tarjeta o
          billetera los procesa directamente el medio de pago; {LEGAL.service} no los recibe ni los guarda.
        </li>
        <li>
          <strong>Datos técnicos:</strong> dirección IP y navegador asociados a cada sesión, por seguridad.
        </li>
      </ul>

      <h2>3. Para qué los usamos</h2>
      <ul>
        <li>Crear y administrar tu cuenta, verificar tu email y permitirte recuperar el acceso.</li>
        <li>Prestar el servicio: guardar y mostrar la información de tu CRM y la de tu equipo.</li>
        <li>Adaptar {LEGAL.service} a tu negocio con los datos que nos diste sobre él.</li>
        <li>Cobrar las suscripciones y emitir los comprobantes correspondientes.</li>
        <li>Enviarte correos necesarios para el servicio (verificación, cambio de contraseña, avisos de la cuenta).</li>
        <li>Prevenir fraude y abusos, y cumplir obligaciones legales.</li>
      </ul>
      <p>
        No vendemos tus datos ni los usamos para publicidad de terceros. Si incorporamos funciones de inteligencia
        artificial que procesen tus datos con proveedores externos, lo vamos a indicar en esta política antes de activarlas.
      </p>

      <h2>4. Con quién los compartimos</h2>
      <p>Solo con proveedores que necesitamos para prestar el servicio, que actúan por nuestra cuenta:</p>
      <ul>
        <li><strong>Neon</strong> (base de datos), con servidores en São Paulo, Brasil.</li>
        <li><strong>Hostinger</strong> (servidores donde corre la aplicación).</li>
        <li><strong>Resend</strong> (envío de correos), con servidores en São Paulo, Brasil.</li>
        <li><strong>Google</strong> y <strong>Microsoft</strong>, solo si elegís iniciar sesión con ellos.</li>
        <li><strong>Mercado Pago</strong> y <strong>NOWPayments</strong>, solo si pagás una suscripción.</li>
      </ul>
      <p>
        Algunos de estos proveedores están fuera de Uruguay. Al usar {LEGAL.service} consentís esa transferencia
        internacional, que realizamos con proveedores que ofrecen niveles adecuados de protección. También podemos
        revelar datos cuando lo exija una autoridad competente conforme a la ley.
      </p>

      <h2>5. Cookies</h2>
      <p>
        Usamos únicamente cookies técnicas necesarias para mantener tu sesión iniciada, y guardamos en tu navegador
        preferencias de la interfaz (por ejemplo, si el menú lateral está abierto). No usamos cookies de publicidad
        ni de seguimiento de terceros.
      </p>

      <h2>6. Datos de tus clientes</h2>
      <p>
        Los datos de contactos y clientes que cargás en el CRM son de tu organización. Respecto de ellos, tu
        organización es la responsable y {LEGAL.service} actúa como encargado del tratamiento: los tratamos solo para
        prestarte el servicio y según tus instrucciones. Es tu responsabilidad contar con la base legal (por ejemplo,
        el consentimiento) para cargarlos y usarlos.
      </p>

      <h2>7. Cuánto tiempo los guardamos</h2>
      <p>
        Mientras tu cuenta esté activa. Si la eliminás, borramos tus datos y los de tu organización en un plazo de
        30 días, salvo los que debamos conservar por obligaciones legales o fiscales, durante el plazo que esas
        normas exijan. Las copias de seguridad se eliminan en su ciclo normal de rotación.
      </p>

      <h2>8. Seguridad</h2>
      <p>
        Aplicamos medidas técnicas y organizativas razonables: conexiones cifradas (HTTPS), contraseñas cifradas,
        aislamiento de los datos de cada organización y acceso restringido a los sistemas. Ningún sistema es
        completamente infalible; si ocurre un incidente que afecte tus datos, te lo vamos a comunicar.
      </p>

      <h2>9. Tus derechos</h2>
      <p>
        Podés ejercer en cualquier momento los derechos de acceso, rectificación, actualización, inclusión y supresión
        de tus datos, y revocar tu consentimiento, escribiendo a <ContactEmail /> desde el email de tu cuenta.
        Respondemos dentro de los plazos de la Ley N.º 18.331 (5 días hábiles). Muchos datos también los podés corregir
        directamente desde tu cuenta.
      </p>
      <p>
        Si considerás que no respondimos adecuadamente, podés presentar una denuncia ante la Unidad Reguladora y de
        Control de Datos Personales (URCDP) de Uruguay.
      </p>

      <h2>10. Menores de edad</h2>
      <p>{LEGAL.service} es un servicio para empresas y profesionales. No está dirigido a menores de 18 años.</p>

      <h2>11. Cambios</h2>
      <p>
        Podemos actualizar esta política. Si los cambios son relevantes te avisamos por email o dentro de la
        aplicación antes de que entren en vigencia. Ver también las <Link href="/cds">Condiciones del servicio</Link>.
      </p>
    </LegalPage>
  )
}

import type { Metadata } from 'next';
import { headers } from 'next/headers';
import {
  BellRingIcon, CloudRainIcon, CreditCardIcon, GlobeIcon, MegaphoneIcon, MessageSquareTextIcon, PlugIcon, WalletIcon, WebhookIcon,
  type LucideIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { leerConfig, listarConfig, listarPlanes, type ConfigFila } from '@/lib/datos-config';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Encabezado } from '@/components/shell';
import { FormGrupo } from '@/components/config/form-grupo';
import { Planes } from '@/components/config/planes';
import { fmtFechaHora } from '@/lib/utils';
import { MODULOS } from '@/lib/modulos';

export const metadata: Metadata = { title: 'Configuración' };

const GRUPOS: { id: string; titulo: string; descripcion: string; icon: LucideIcon }[] = [
  { id: 'lluvia', titulo: 'Alerta de lluvia', descripcion: 'Cuándo se avisa y cuántas veces por semana como máximo.', icon: CloudRainIcon },
  { id: 'difusiones', titulo: 'Difusiones', descripcion: 'Respuestas y pausa automática a quien no responde.', icon: MegaphoneIcon },
  { id: 'suscripcion', titulo: 'Suscripción', descripcion: 'Prueba gratis y días por pago.', icon: WalletIcon },
  { id: 'vencimientos', titulo: 'Vencimientos', descripcion: 'Control diario y aviso antes de vencer.', icon: BellRingIcon },
  { id: 'whatsapp', titulo: 'WhatsApp y Chatwoot', descripcion: 'Cuenta, inbox y nombres de las plantillas aprobadas por Meta.', icon: MessageSquareTextIcon },
  { id: 'mensajes', titulo: 'Mensajes del bot', descripcion: 'Textos que envía el bot. Puedes usar las variables indicadas.', icon: MessageSquareTextIcon },
  { id: 'integraciones', titulo: 'Integraciones', descripcion: 'Conexión del panel con los flujos de n8n.', icon: PlugIcon },
  { id: 'general', titulo: 'General', descripcion: 'Zona horaria del sistema.', icon: GlobeIcon },
].filter((g) => MODULOS.difusiones || !['difusiones', 'integraciones'].includes(g.id));

/** Claves que solo usan las difusiones (se ocultan mientras el módulo está apagado) */
const esDeDifusiones = (clave: string) => /^(difusion_|plantilla_difusion|n8n_)/.test(clave);

export default async function ConfiguracionPage() {
  await requerirSesion();
  const [config, planes, token, h] = await Promise.all([listarConfig(), listarPlanes(), leerConfig<string>('chatwoot_webhook_token'), headers()]);
  const webhook = `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('x-forwarded-host') ?? h.get('host')}/panel/api/chatwoot/webhook?token=${token ?? ''}`;
  const porGrupo = new Map<string, ConfigFila[]>();
  for (const f of config) {
    if (!MODULOS.difusiones && esDeDifusiones(f.clave)) continue;
    porGrupo.set(f.grupo, [...(porGrupo.get(f.grupo) ?? []), f]);
  }
  const ultima = config.reduce<ConfigFila | null>((a, f) => (!a || f.updated_at > a.updated_at ? f : a), null);

  return (
    <>
      <Encabezado
        titulo="Configuración"
        descripcion={ultima?.actualizado_por ? `Último cambio: ${fmtFechaHora(ultima.updated_at)} por ${ultima.actualizado_por}` : 'Reglas del bot, planes y mensajes.'}
      />

      <nav className="-mx-1 mb-6 flex gap-1 overflow-x-auto px-1 pb-1">
        {[{ id: 'planes', titulo: 'Planes' }, ...GRUPOS].filter((g) => g.id === 'planes' || porGrupo.has(g.id)).map((g) => (
          <a key={g.id} href={`#${g.id}`} className="shrink-0 rounded-full border bg-card px-3 py-1.5 text-sm hover:bg-accent">{g.titulo}</a>
        ))}
      </nav>

      <div className="grid gap-6">
        {GRUPOS.slice(0, MODULOS.difusiones ? 2 : 1).map((g) => porGrupo.has(g.id) && <Grupo key={g.id} g={g} filas={porGrupo.get(g.id)!} />)}

        <Card id="planes" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CreditCardIcon className="size-4" /> Planes</CardTitle>
            <CardDescription>Aparecen al marcar un pago. El cobro es manual; el panel solo registra.</CardDescription>
          </CardHeader>
          <CardContent><Planes planes={planes} /></CardContent>
        </Card>

        {GRUPOS.slice(MODULOS.difusiones ? 2 : 1).map((g) => porGrupo.has(g.id) && (
          <Grupo key={g.id} g={g} filas={porGrupo.get(g.id)!}>
            {g.id === 'whatsapp' && <WebhookPanel url={webhook} />}
          </Grupo>
        ))}
      </div>
    </>
  );
}

/** URL que Chatwoot llama en cada mensaje: notificaciones del chat web y estados de las difusiones */
function WebhookPanel({ url }: { url: string }) {
  return (
    <details className="mt-6 rounded-xl border p-4 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><WebhookIcon className="size-4" /> Webhook del panel (notificaciones del chat web)</summary>
      <div className="mt-3 grid gap-2 text-muted-foreground">
        <p>Con este webhook, al cliente del chat web le llega una notificación cuando el bot o un agente le responde.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>En Chatwoot: <strong>Configuración → Integraciones → Webhooks → Agregar</strong>.</li>
          <li>Pega esta URL (con la dirección pública del sitio, ej. https://iagro360.xyz):
            <code className="mt-1 block break-all rounded bg-muted px-2 py-1 text-foreground">{url}</code>
          </li>
          <li>Marca los eventos <strong>Mensaje creado</strong> y <strong>Mensaje actualizado</strong>.</li>
        </ol>
      </div>
    </details>
  );
}

function Grupo({ g, filas, children }: { g: (typeof GRUPOS)[number]; filas: ConfigFila[]; children?: React.ReactNode }) {
  return (
    <Card id={g.id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><g.icon className="size-4" /> {g.titulo}</CardTitle>
        <CardDescription>{g.descripcion}</CardDescription>
      </CardHeader>
      <CardContent><FormGrupo grupo={g.id} filas={filas} />{children}</CardContent>
    </Card>
  );
}

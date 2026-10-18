import type { Metadata } from 'next';
import {
  BellRingIcon, CloudRainIcon, CreditCardIcon, GlobeIcon, MegaphoneIcon, MessageSquareTextIcon, PlugIcon, WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { requerirSesion } from '@/lib/auth';
import { listarConfig, listarPlanes, type ConfigFila } from '@/lib/datos-config';
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
  const [config, planes] = await Promise.all([listarConfig(), listarPlanes()]);
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

        {GRUPOS.slice(MODULOS.difusiones ? 2 : 1).map((g) => porGrupo.has(g.id) && <Grupo key={g.id} g={g} filas={porGrupo.get(g.id)!} />)}
      </div>
    </>
  );
}

function Grupo({ g, filas }: { g: (typeof GRUPOS)[number]; filas: ConfigFila[] }) {
  return (
    <Card id={g.id} className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><g.icon className="size-4" /> {g.titulo}</CardTitle>
        <CardDescription>{g.descripcion}</CardDescription>
      </CardHeader>
      <CardContent><FormGrupo grupo={g.id} filas={filas} /></CardContent>
    </Card>
  );
}

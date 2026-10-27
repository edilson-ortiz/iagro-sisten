'use client';

import { useMemo, useState } from 'react';
import type { AppWeb } from './app-web';
import s from './chat.module.css';

/**
 * Mini tutorial de la primera visita: qué es IAGRO, instalar la app y permitir las notificaciones.
 * Los pasos que no aplican (app ya instalada, permiso ya dado, navegador sin soporte) se saltan.
 */
type Paso = 'hola' | 'instalar' | 'avisos' | 'listo';

export function Bienvenida({ app, alTerminar, alInstalarIOS }: { app: AppWeb; alTerminar: () => void; alInstalarIOS: () => void }) {
  const pasos = useMemo<Paso[]>(() => [
    'hola',
    ...(!app.instalada && (app.puedeInstalar || app.esIOS) ? ['instalar' as const] : []),
    ...(app.permiso === 'default' || app.permiso === 'instalar-primero' ? ['avisos' as const] : []),
    'listo',
    // Se calcula una sola vez al abrir: si el usuario instala o da el permiso, no cambian los pasos a mitad del tutorial
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);
  const [n, setN] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const paso = pasos[n];
  const seguir = () => (n + 1 < pasos.length ? setN(n + 1) : alTerminar());

  const instalar = async () => {
    if (app.esIOS) { alInstalarIOS(); return; }
    setOcupado(true);
    await app.instalar().finally(() => setOcupado(false));
    seguir();
  };
  const permitir = async () => {
    setOcupado(true);
    await app.activarNotificaciones().finally(() => setOcupado(false));
    seguir();
  };

  return (
    <div className={s.fondoHoja}>
      <div className={s.tutorial} role="dialog" aria-modal="true" aria-label="Bienvenida">
        <div className={s.tutorialPuntos} aria-hidden="true">
          {pasos.map((p, i) => <i key={p} className={i === n ? s.puntoActivo : ''} />)}
        </div>

        {paso === 'hola' && (
          <>
            <img className={s.tutorialLogo} src="/img/app-192.png" alt="" width={96} height={96} />
            <h2>Bienvenido a IAGRO Clima</h2>
            <p>Tu asistente del clima para el campo. Aquí recibes el <b>pronóstico</b>, el <b>radar de lluvia</b> y las <b>alertas</b> antes de que llueva.</p>
            <ul className={s.tutorialLista}>
              <li><span>👆</span>Toca los botones de los mensajes para elegir una opción.</li>
              <li><span>◎</span>Toca la foto de IAGRO para ver los estados: el radar de lluvia del día.</li>
              <li><span>✍️</span>También puedes escribir, por ejemplo «llovió 15 mm».</li>
            </ul>
            <button type="button" className={s.tutorialBoton} onClick={seguir}>Siguiente</button>
          </>
        )}

        {paso === 'instalar' && (
          <>
            <div className={s.tutorialIcono}>📲</div>
            <h2>Instala la app de IAGRO</h2>
            {app.esIOS ? (
              <p>En tu iPhone toca <b>Compartir</b> <span className={s.ios}>⬆︎</span> abajo en Safari y luego <b>«Agregar a inicio»</b>. Así entras con un toque y puedes recibir las alertas.</p>
            ) : (
              <p>Queda en la pantalla de inicio de tu celular como una app: entras con un toque, sin buscar el enlace.</p>
            )}
            <button type="button" className={s.tutorialBoton} onClick={instalar} disabled={ocupado}>
              {app.esIOS ? 'Ver cómo instalar' : 'Instalar app'}
            </button>
            <button type="button" className={s.tutorialLuego} onClick={seguir}>Ahora no</button>
          </>
        )}

        {paso === 'avisos' && (
          <>
            <div className={s.tutorialIcono}>🔔</div>
            <h2>Activa las notificaciones</h2>
            {app.permiso === 'instalar-primero' ? (
              <p>En iPhone las notificaciones funcionan con la app instalada. Instálala con <b>Compartir → Agregar a inicio</b>, ábrela desde el ícono y actívalas allí.</p>
            ) : (
              <p>Así te avisamos <b>antes de que llueva</b> en tu campo y cuando te respondemos, aunque tengas el chat cerrado. Cuando el navegador pregunte, toca <b>«Permitir»</b>.</p>
            )}
            {app.permiso === 'default' && (
              <button type="button" className={s.tutorialBoton} onClick={permitir} disabled={ocupado}>Permitir notificaciones</button>
            )}
            <button type="button" className={app.permiso === 'default' ? s.tutorialLuego : s.tutorialBoton} onClick={seguir}>
              {app.permiso === 'default' ? 'Ahora no' : 'Entendido'}
            </button>
          </>
        )}

        {paso === 'listo' && (
          <>
            <div className={s.tutorialIcono}>✅</div>
            <h2>¡Listo!</h2>
            <p>Escribe <b>Hola</b> o toca <b>Empezar</b> y el asistente te muestra el menú.</p>
            <button type="button" className={s.tutorialBoton} onClick={alTerminar}>Empezar</button>
          </>
        )}
      </div>
    </div>
  );
}

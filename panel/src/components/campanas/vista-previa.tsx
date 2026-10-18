import { Fragment } from 'react';
import { CornerUpLeftIcon } from 'lucide-react';

const VARIABLE = /(\{\{\s*[\w.]+\s*\}\})/g;

/** Texto plano: las variables que quedaron sin valor se resaltan, ej. {{1}} */
function Texto({ texto }: { texto: string }) {
  return (
    <>
      {texto.split(VARIABLE).map((p, i) => (/^\{\{/.test(p)
        ? <span key={i} className="rounded bg-amber-200/70 px-1 font-mono text-[0.8em] text-amber-900">{p}</span>
        : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}

/** *negrita*  _cursiva_  ~tachado~  como los muestra WhatsApp */
function Formato({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~)/g);
  return (
    <>
      {partes.map((p, i) => {
        if (/^\*[^*\n]+\*$/.test(p)) return <strong key={i}><Texto texto={p.slice(1, -1)} /></strong>;
        if (/^_[^_\n]+_$/.test(p)) return <em key={i}><Texto texto={p.slice(1, -1)} /></em>;
        if (/^~[^~\n]+~$/.test(p)) return <s key={i}><Texto texto={p.slice(1, -1)} /></s>;
        return <Texto key={i} texto={p} />;
      })}
    </>
  );
}

/** Primero se reemplazan las variables y después se aplica el formato (así *{{2}}* sale en negrita) */
function ConVariables({ texto, valores }: { texto: string; valores: Record<string, string> }) {
  const final = texto.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k: string) => valores[k] || m);
  return <Formato texto={final} />;
}

/** Burbuja de WhatsApp con la plantilla tal como la verá el contacto */
export function VistaPrevia({
  cabecera, cuerpo, pie, botones, valores, hora = '16:25',
}: {
  cabecera?: string | null; cuerpo: string; pie?: string | null; botones?: string[]; valores: Record<string, string>; hora?: string;
}) {
  return (
    <div className="rounded-xl bg-[#e5ddd5] p-4 dark:bg-[#0b141a]">
      <div className="max-w-[420px]">
        <div className="relative rounded-lg rounded-tl-none bg-white px-3 pt-2 pb-1.5 text-[0.92rem] leading-snug text-[#111b21] shadow-sm dark:bg-[#202c33] dark:text-[#e9edef]">
          {cabecera && <p className="mb-1 font-semibold"><ConVariables texto={cabecera} valores={valores} /></p>}
          <p className="break-words whitespace-pre-wrap"><ConVariables texto={cuerpo} valores={valores} /></p>
          {pie && <p className="mt-1 text-xs text-[#667781] dark:text-[#8696a0]">{pie}</p>}
          <p className="mt-0.5 text-right text-[0.68rem] text-[#667781] dark:text-[#8696a0]">{hora}</p>
        </div>
        {botones && botones.length > 0 && (
          <div className="mt-1 grid gap-1">
            {botones.map((b) => (
              <div key={b} className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-2 text-sm font-medium text-[#027eb5] shadow-sm dark:bg-[#202c33] dark:text-[#53bdeb]">
                <CornerUpLeftIcon className="size-3.5" /> {b}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

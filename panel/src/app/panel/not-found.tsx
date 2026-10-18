import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-semibold text-primary">404</p>
      <p className="text-lg font-medium">No encontramos esta página</p>
      <Button asChild variant="outline"><Link href="/panel">Volver al inicio</Link></Button>
    </main>
  );
}

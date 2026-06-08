import Link from 'next/link';
import { HelpCircle, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CHAPTERS } from './_content/chapters';

export default function HelpNotFound() {
  return (
    <div className="mx-auto max-w-2xl space-y-6 py-8">
      <div className="flex items-start gap-4">
        <HelpCircle className="mt-1 h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-bold">We couldn&apos;t find that page</h1>
          <p className="mt-2 text-muted-foreground">
            Maybe a typo? Pick one of the chapters below, or head back to the Help home.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-muted-foreground">Try one of these:</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {CHAPTERS.map((c) => (
            <li key={c.id}>
              <Link
                href={`/help/${c.id}`}
                className="block rounded-md border p-3 text-sm hover:border-primary hover:bg-accent"
              >
                <span className="font-medium">{c.label.en}</span>
                <span className="block text-muted-foreground">{c.hook.en}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <Button asChild variant="outline">
        <Link href="/help">
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Back to Help home
        </Link>
      </Button>
    </div>
  );
}

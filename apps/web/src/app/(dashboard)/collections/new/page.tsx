'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { usePostCollection } from '@/hooks/useCollections';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  loanId: z.string().min(1, 'Loan ID is required'),
  amountPaise: z.coerce.number().int().positive('Amount must be positive'),
  paymentDate: z.string().min(1, 'Payment date is required'),
  paymentMode: z.enum(['cash', 'bank_transfer', 'online']),
});

type FormData = z.infer<typeof schema>;

export default function NewCollectionPage() {
  const router = useRouter();
  const postCollection = usePostCollection();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { paymentMode: 'cash', paymentDate: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: FormData) {
    const idempotencyKey = crypto.randomUUID();
    await postCollection.mutateAsync({ ...data, idempotencyKey });
    router.push('/collections');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/collections"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Post Collection</h1>
      </div>

      {postCollection.error && <ErrorMessage message={(postCollection.error as Error).message} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader><CardTitle className="text-base">Collection Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Loan ID *" error={errors.loanId?.message}>
              <Input {...register('loanId')} placeholder="Loan UUID" />
            </Field>
            <Field label="Amount (paise) *" error={errors.amountPaise?.message}>
              <Input {...register('amountPaise')} type="number" inputMode="numeric" />
            </Field>
            <Field label="Payment Date *" error={errors.paymentDate?.message}>
              <Input {...register('paymentDate')} type="date" />
            </Field>
            <Field label="Payment Mode *" error={errors.paymentMode?.message}>
              <select {...register('paymentMode')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="online">Online</option>
              </select>
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="min-w-[160px]">
            {isSubmitting ? 'Posting…' : 'Post Collection'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateLoan } from '@/hooks/useLoans';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  productVersionId: z.string().min(1, 'Loan product is required'),
  principalPaise: z.coerce.number().int().positive('Principal must be positive'),
  tenureMonths: z.coerce.number().int().min(1, 'Tenure must be at least 1 month'),
  purpose: z.string().min(1, 'Purpose is required'),
});

type FormData = z.infer<typeof schema>;

export default function NewLoanPage() {
  const router = useRouter();
  const createLoan = useCreateLoan();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    await createLoan.mutateAsync(data);
    router.push('/loans');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/loans"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">New Loan Application</h1>
      </div>

      {createLoan.error && <ErrorMessage message={(createLoan.error as Error).message} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader><CardTitle className="text-base">Loan Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Customer ID *" error={errors.customerId?.message}>
              <Input {...register('customerId')} placeholder="Customer UUID" />
            </Field>
            <Field label="Loan Product Version ID *" error={errors.productVersionId?.message}>
              <Input {...register('productVersionId')} placeholder="Product version UUID" />
            </Field>
            <Field label="Principal (paise) *" error={errors.principalPaise?.message}>
              <Input {...register('principalPaise')} type="number" inputMode="numeric" />
            </Field>
            <Field label="Tenure (months) *" error={errors.tenureMonths?.message}>
              <Input {...register('tenureMonths')} type="number" inputMode="numeric" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Purpose *" error={errors.purpose?.message}>
                <Input {...register('purpose')} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Create Loan Application'}
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

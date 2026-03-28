'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  category: z.string().min(1, 'Category is required'),
  amountPaise: z.coerce.number().int().positive('Amount must be positive'),
  description: z.string().min(1, 'Description is required'),
  date: z.string().min(1, 'Date is required'),
});

type FormData = z.infer<typeof schema>;

export default function NewExpensePage() {
  const router = useRouter();
  const qc = useQueryClient();
  const mutation = useMutation({
    mutationFn: (data: FormData) => apiClient.post('/cashbook/expenses', data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cashbook'] }); },
  });

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { date: new Date().toISOString().slice(0, 10) },
  });

  async function onSubmit(data: FormData) {
    await mutation.mutateAsync(data);
    router.push('/cashbook');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/cashbook"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Record Expense</h1>
      </div>

      {mutation.error && <ErrorMessage message={(mutation.error as Error).message} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader><CardTitle className="text-base">Expense Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Category *" error={errors.category?.message}>
              <select {...register('category')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select…</option>
                <option value="salary">Salary</option>
                <option value="rent">Rent</option>
                <option value="travel">Travel</option>
                <option value="office">Office</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Amount (paise) *" error={errors.amountPaise?.message}>
              <Input {...register('amountPaise')} type="number" inputMode="numeric" />
            </Field>
            <Field label="Date *" error={errors.date?.message}>
              <Input {...register('date')} type="date" />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Description *" error={errors.description?.message}>
                <Input {...register('description')} />
              </Field>
            </div>
          </CardContent>
        </Card>
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Saving…' : 'Record Expense'}</Button>
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

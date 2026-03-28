'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateCustomer } from '@/hooks/useCustomers';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const schema = z.object({
  fullName: z.string().min(2, 'Name is required'),
  fatherOrHusbandName: z.string().optional(),
  mobile: z.string().regex(/^[6-9]\d{9}$/, 'Valid 10-digit mobile required'),
  aadhaarNumber: z.string().regex(/^\d{12}$/, 'Valid 12-digit Aadhaar required'),
  gender: z.enum(['male', 'female', 'other']),
  addressLine1: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  district: z.string().min(1, 'District is required'),
  state: z.string().min(1, 'State is required'),
  pincode: z.string().regex(/^\d{6}$/, 'Valid 6-digit pincode required'),
});

type FormData = z.infer<typeof schema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const createCustomer = useCreateCustomer();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    await createCustomer.mutateAsync(data);
    router.push('/customers');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/customers"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <h1 className="text-2xl font-bold">Register Customer</h1>
      </div>

      {createCustomer.error && <ErrorMessage message={(createCustomer.error as Error).message} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader><CardTitle className="text-base">Customer Details</CardTitle></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name *" error={errors.fullName?.message}>
              <Input {...register('fullName')} />
            </Field>
            <Field label="Father/Husband Name" error={errors.fatherOrHusbandName?.message}>
              <Input {...register('fatherOrHusbandName')} />
            </Field>
            <Field label="Mobile *" error={errors.mobile?.message}>
              <Input {...register('mobile')} inputMode="numeric" />
            </Field>
            <Field label="Aadhaar Number *" error={errors.aadhaarNumber?.message}>
              <Input {...register('aadhaarNumber')} inputMode="numeric" maxLength={12} />
            </Field>
            <Field label="Gender *" error={errors.gender?.message}>
              <select {...register('gender')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Address *" error={errors.addressLine1?.message}>
              <Input {...register('addressLine1')} />
            </Field>
            <Field label="City *" error={errors.city?.message}>
              <Input {...register('city')} />
            </Field>
            <Field label="District *" error={errors.district?.message}>
              <Input {...register('district')} />
            </Field>
            <Field label="State *" error={errors.state?.message}>
              <Input {...register('state')} />
            </Field>
            <Field label="Pincode *" error={errors.pincode?.message}>
              <Input {...register('pincode')} inputMode="numeric" maxLength={6} />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'Register Customer'}
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

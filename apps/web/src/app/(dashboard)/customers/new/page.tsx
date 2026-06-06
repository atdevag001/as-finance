'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { createCustomerSchema } from '@as-finance/shared/validation';
// Note: aadhaarSchema, panSchema, mobileSchema, pincodeSchema are composed
// into createCustomerSchema — field-level validation uses the shared schemas.
import { useCreateCustomer, type DuplicateWarning } from '@/hooks/useCustomers';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Form schema extends the shared createCustomerSchema but uses a rupee string
 * for monthly income (user enters rupees, we convert to paise on submit).
 */
const formSchema = createCustomerSchema
  .omit({ monthlyIncomePaise: true })
  .extend({
    monthlyIncomeRupees: z.string().optional(),
  });

type FormData = z.infer<typeof formSchema>;

export default function NewCustomerPage() {
  const router = useRouter();
  const createCustomer = useCreateCustomer();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);
  // Backend returns duplicateWarnings on create — surface them so the manager can review matches.
  const [duplicateInfo, setDuplicateInfo] = useState<
    { customerId: string; warnings: DuplicateWarning[] } | null
  >(null);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  // Watch DOB field to auto-calculate age
  const dobValue = useWatch({ control, name: 'dob' });

  useEffect(() => {
    if (dobValue) {
      const birthDate = new Date(dobValue);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age >= 0 && age <= 120) {
        setValue('age', age);
      }
    }
  }, [dobValue, setValue]);

  async function onSubmit(data: FormData) {
    setServerError(null);

    // Build API payload — convert rupees to paise for monthly income
    const { monthlyIncomeRupees, ...rest } = data;
    const payload: Record<string, unknown> = { ...rest };
    if (monthlyIncomeRupees && monthlyIncomeRupees.trim() !== '') {
      payload['monthlyIncomePaise'] = Math.round(parseFloat(monthlyIncomeRupees) * 100);
    }

    try {
      const result = await createCustomer.mutateAsync(payload);
      const warnings = result.duplicateWarnings ?? [];
      if (warnings.length > 0) {
        // Hold navigation until the manager acknowledges the matched customers.
        showToast({
          message: 'Customer registered — possible duplicates detected. Please review.',
          variant: 'warning',
        });
        setDuplicateInfo({ customerId: result.customer.id, warnings });
        return;
      }
      showToast({ message: 'Customer registered successfully', variant: 'success' });
      router.push('/customers');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setServerError('Customer with this Aadhaar or mobile already exists.');
        } else if (err.statusCode === 400) {
          setServerError(err.body.message || 'Validation error. Please check your inputs.');
        } else {
          setServerError(err.body.message || 'Something went wrong. Please try again.');
        }
      } else {
        setServerError('Unable to connect to server. Please check your connection.');
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/customers">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Register Customer</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Personal Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Personal Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name *" error={errors.fullName?.message}>
              <Input {...register('fullName')} />
            </Field>
            <Field label="Father/Husband Name" error={errors.fatherOrHusbandName?.message}>
              <Input {...register('fatherOrHusbandName')} />
            </Field>
            <Field label="Mobile *" error={errors.mobile?.message}>
              <Input {...register('mobile')} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Alternate Mobile" error={errors.alternateMobile?.message}>
              <Input {...register('alternateMobile')} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Aadhaar Number *" error={errors.aadhaarNumber?.message}>
              <Input {...register('aadhaarNumber')} inputMode="numeric" maxLength={12} />
            </Field>
            <Field label="PAN" error={errors.panNumber?.message}>
              <Input {...register('panNumber')} maxLength={10} placeholder="e.g. ABCDE1234F" />
            </Field>
            <Field label="Date of Birth" error={errors.dob?.message}>
              <Input {...register('dob')} type="date" />
            </Field>
            <Field label="Age" error={errors.age?.message}>
              <Input
                {...register('age', { setValueAs: (v) => (v === '' ? undefined : Number(v)) })}
                type="number"
                inputMode="numeric"
                min={18}
                max={120}
                readOnly={!!dobValue}
                className={dobValue ? 'bg-muted' : ''}
              />
              {dobValue && (
                <p className="text-xs text-muted-foreground mt-1">Auto-calculated from DOB</p>
              )}
            </Field>
            <Field label="Gender *" error={errors.gender?.message}>
              <select
                {...register('gender')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Select…</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </Field>
            <Field label="Occupation" error={errors.occupation?.message}>
              <Input {...register('occupation')} />
            </Field>
            <Field label="Work/Business Details" error={errors.workOrBusinessDetails?.message}>
              <Input {...register('workOrBusinessDetails')} placeholder="e.g., Shop owner at Main Market" />
            </Field>
            <Field label="Monthly Income (₹)" error={errors.monthlyIncomeRupees?.message}>
              <Input
                {...register('monthlyIncomeRupees')}
                inputMode="decimal"
                placeholder="e.g. 25000"
              />
            </Field>
          </CardContent>
        </Card>

        {/* Address Details */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Address Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Address Line 1 *" error={errors.addressLine1?.message}>
                <Input {...register('addressLine1')} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Address Line 2" error={errors.addressLine2?.message}>
                <Input {...register('addressLine2')} />
              </Field>
            </div>
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

        {/* Notes */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Additional Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <Field label="Notes" error={errors.notes?.message}>
              <textarea
                {...register('notes')}
                rows={3}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="w-full min-h-[48px] sm:w-auto">
            {isSubmitting ? 'Saving…' : 'Register Customer'}
          </Button>
        </div>
      </form>

      <Dialog
        open={!!duplicateInfo}
        onOpenChange={(open) => {
          if (!open) {
            setDuplicateInfo(null);
            router.push('/customers');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Possible duplicate customer</DialogTitle>
            <DialogDescription>
              The customer was created, but the following existing customers share key identifiers.
              Please review before continuing.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-72 overflow-y-auto">
            {duplicateInfo?.warnings.map((w) => (
              <div key={w.field} className="rounded-md border p-3">
                <p className="text-sm font-medium capitalize">Matched on {w.field}</p>
                <ul className="mt-2 space-y-1">
                  {w.matchedCustomers.map((m) => (
                    <li key={m.id} className="text-sm">
                      <Link
                        href={`/customers/${m.id}`}
                        className="text-primary underline underline-offset-2"
                      >
                        {m.fullName}
                      </Link>
                      <span className="text-muted-foreground"> ({m.id})</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (duplicateInfo) router.push(`/customers/${duplicateInfo.customerId}`);
                setDuplicateInfo(null);
              }}
            >
              View new customer
            </Button>
            <Button
              onClick={() => {
                setDuplicateInfo(null);
                router.push('/customers');
              }}
            >
              Acknowledge &amp; continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

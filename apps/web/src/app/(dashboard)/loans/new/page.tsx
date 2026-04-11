'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateLoan } from '@/hooks/useLoans';
import { useLoanProductsList } from '@/hooks/useLoanProducts';
import { useCustomers, type Customer } from '@/hooks/useCustomers';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const formSchema = z.object({
  customerId: z.string().min(1, 'Customer is required'),
  productVersionId: z.string().min(1, 'Loan product is required'),
  principalRupees: z
    .string()
    .min(1, 'Principal is required')
    .refine((v) => {
      const n = parseFloat(v);
      return !isNaN(n) && n > 0;
    }, 'Principal must be a positive amount'),
  tenureMonths: z.coerce.number().int().min(1, 'Tenure must be at least 1 month'),
  purpose: z.string().min(1, 'Purpose is required'),
});

type FormData = z.infer<typeof formSchema>;

export default function NewLoanPage() {
  const router = useRouter();
  const createLoan = useCreateLoan();
  const { showToast } = useToast();
  const { data: loanProducts, isLoading: productsLoading } = useLoanProductsList();
  const [serverError, setServerError] = useState<string | null>(null);

  // Customer search state
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce customer search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(customerSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [customerSearch]);

  const { data: customerResults } = useCustomers({
    search: debouncedSearch || undefined,
    page: 1,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerId: '',
      productVersionId: '',
      principalRupees: '',
      purpose: '',
    },
  });

  const handleSelectCustomer = useCallback(
    (customer: Customer) => {
      setSelectedCustomer(customer);
      setCustomerSearch(customer.full_name);
      setValue('customerId', customer.id, { shouldValidate: true });
      setShowDropdown(false);
    },
    [setValue],
  );

  const handleClearCustomer = useCallback(() => {
    setSelectedCustomer(null);
    setCustomerSearch('');
    setValue('customerId', '', { shouldValidate: true });
  }, [setValue]);

  async function onSubmit(data: FormData) {
    setServerError(null);

    const principalPaise = Math.round(parseFloat(data.principalRupees) * 100);

    const payload: Record<string, unknown> = {
      customerId: data.customerId,
      productVersionId: data.productVersionId,
      principalPaise,
      tenureMonths: data.tenureMonths,
      purpose: data.purpose,
    };

    try {
      await createLoan.mutateAsync(payload);
      showToast({ message: 'Loan application created successfully', variant: 'success' });
      router.push('/loans');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 400) {
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
          <Link href="/loans">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Loan Application</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Loan Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Customer search typeahead */}
            <div className="sm:col-span-2">
              <Field label="Customer *" error={errors.customerId?.message}>
                <input type="hidden" {...register('customerId')} />
                <div ref={dropdownRef} className="relative">
                  {selectedCustomer ? (
                    <div className="flex h-10 items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <span>
                        {selectedCustomer.full_name} — {selectedCustomer.mobile}
                      </span>
                      <button
                        type="button"
                        onClick={handleClearCustomer}
                        className="ml-2 rounded p-0.5 hover:bg-muted"
                        aria-label="Clear customer selection"
                      >
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={customerSearch}
                        onChange={(e) => {
                          setCustomerSearch(e.target.value);
                          setShowDropdown(true);
                        }}
                        onFocus={() => {
                          if (customerSearch.length > 0) setShowDropdown(true);
                        }}
                        placeholder="Search by name or mobile…"
                        className="pl-9"
                        autoComplete="off"
                      />
                    </div>
                  )}
                  {showDropdown && !selectedCustomer && debouncedSearch.length > 0 && (
                    <ul
                      className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md"
                      role="listbox"
                    >
                      {customerResults?.data && customerResults.data.length > 0 ? (
                        customerResults.data.map((c) => (
                          <li
                            key={c.id}
                            role="option"
                            aria-selected={false}
                            className="cursor-pointer px-3 py-2 text-sm hover:bg-accent"
                            onClick={() => handleSelectCustomer(c)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSelectCustomer(c);
                            }}
                            tabIndex={0}
                          >
                            <span className="font-medium">{c.full_name}</span>
                            <span className="ml-2 text-muted-foreground">{c.mobile}</span>
                            <span className="ml-2 text-muted-foreground">— {c.city}</span>
                          </li>
                        ))
                      ) : (
                        <li className="px-3 py-2 text-sm text-muted-foreground">
                          No customers found
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              </Field>
            </div>

            {/* Loan product dropdown */}
            <Field label="Loan Product *" error={errors.productVersionId?.message}>
              <select
                {...register('productVersionId')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                disabled={productsLoading}
              >
                <option value="">
                  {productsLoading ? 'Loading products…' : 'Select loan product'}
                </option>
                {(Array.isArray(loanProducts) ? loanProducts : []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.interest_type === 'flat' ? 'Flat' : 'Reducing'} @{' '}
                    {p.annual_rate}% ({p.frequency})
                  </option>
                ))}
              </select>
            </Field>

            {/* Principal in rupees */}
            <Field label="Principal Amount (₹) *" error={errors.principalRupees?.message}>
              <Input
                {...register('principalRupees')}
                inputMode="decimal"
                placeholder="e.g. 50000"
              />
            </Field>

            {/* Tenure */}
            <Field label="Tenure (months) *" error={errors.tenureMonths?.message}>
              <Input
                {...register('tenureMonths', {
                  setValueAs: (v) => (v === '' ? undefined : Number(v)),
                })}
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="e.g. 12"
              />
            </Field>

            {/* Purpose */}
            <div className="sm:col-span-2">
              <Field label="Purpose *" error={errors.purpose?.message}>
                <Input {...register('purpose')} placeholder="e.g. Business expansion" />
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

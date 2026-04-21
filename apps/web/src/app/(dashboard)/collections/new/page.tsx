'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, X, Banknote, Building2, Globe } from 'lucide-react';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { useLoans, type Loan } from '@/hooks/useLoans';
import { useToast } from '@/providers/toast-provider';
import { todayIST } from '@/lib/date-utils';
import { ConfirmDialog, MoneyDisplay, ErrorMessage, LoadingSpinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useQueryClient } from '@tanstack/react-query';

type PaymentMode = 'cash' | 'bank_transfer' | 'online';

interface CollectionResponse {
  collectionId: string;
  receiptId: string;
  receiptNumber: string;
  loanNumber: string;
  amountPaise: number;
}

const PAYMENT_MODES: { value: PaymentMode; label: string; icon: typeof Banknote }[] = [
  { value: 'cash', label: 'Cash', icon: Banknote },
  { value: 'bank_transfer', label: 'Bank Transfer', icon: Building2 },
  { value: 'online', label: 'Online', icon: Globe },
];

export default function NewCollectionPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Idempotency key generated once per form session
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Loan search state
  const [loanSearch, setLoanSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Form state
  const [amountRupees, setAmountRupees] = useState('');
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentDate, setPaymentDate] = useState(() => todayIST());

  // Submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Validation errors
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Debounce loan search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(loanSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [loanSearch]);

  const { data: loanResults, isLoading: loansLoading } = useLoans({
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

  const handleSelectLoan = useCallback((loan: Loan) => {
    setSelectedLoan(loan);
    setLoanSearch(loan.loan_number);
    setShowDropdown(false);
    setErrors((prev) => {
      const next = { ...prev };
      delete next['loan'];
      return next;
    });
  }, []);

  const handleClearLoan = useCallback(() => {
    setSelectedLoan(null);
    setLoanSearch('');
  }, []);

  function validate(): boolean {
    const newErrors: Record<string, string> = {};

    if (!selectedLoan) {
      newErrors['loan'] = 'Please select a loan';
    }

    const amount = parseFloat(amountRupees);
    if (!amountRupees || isNaN(amount) || amount <= 0) {
      newErrors['amount'] = 'Amount must be a positive number';
    }

    if (!paymentDate) {
      newErrors['date'] = 'Payment date is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setShowConfirm(true);
  }

  async function handleConfirmPost() {
    if (!selectedLoan) return;

    setIsSubmitting(true);
    setServerError(null);

    const amountPaise = Math.round(parseFloat(amountRupees) * 100);

    try {
      const result = await apiClient.post<CollectionResponse>(
        '/collections',
        {
          loanId: selectedLoan.id,
          amountPaise,
          paymentDate,
          paymentMode,
          idempotencyKey,
        },
        {
          headers: { 'X-Idempotency-Key': idempotencyKey },
        },
      );

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ['collections'] });
      queryClient.invalidateQueries({ queryKey: ['loans'] });

      showToast({ message: 'Collection posted successfully', variant: 'success' });
      setShowConfirm(false);

      // Navigate to receipt view
      if (result?.receiptId) {
        router.push(`/receipts/${result.receiptId}`);
      } else {
        router.push('/collections');
      }
    } catch (err) {
      setShowConfirm(false);
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to post collection. Please try again.');
      } else {
        setServerError('Unable to connect to server. Please check your connection.');
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const amountPaisePreview = amountRupees && !isNaN(parseFloat(amountRupees))
    ? Math.round(parseFloat(amountRupees) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" asChild>
          <Link href="/collections">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Post Collection</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleFormSubmit}>
        {/* Loan Search */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Select Loan</CardTitle>
          </CardHeader>
          <CardContent>
            <div ref={dropdownRef} className="relative">
              {selectedLoan ? (
                <div className="rounded-lg border border-input bg-muted/50 p-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {selectedLoan.customer?.full_name ?? 'Customer'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Loan: {selectedLoan.loan_number}
                      </p>
                      <div className="text-sm">
                        Outstanding:{' '}
                        <MoneyDisplay
                          paise={selectedLoan.cached_outstanding_paise ?? 0}
                          className="font-semibold"
                        />
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleClearLoan}
                      disabled={isSubmitting}
                      className="rounded p-1 hover:bg-muted"
                      aria-label="Clear loan selection"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={loanSearch}
                      onChange={(e) => {
                        setLoanSearch(e.target.value);
                        setShowDropdown(true);
                      }}
                      onFocus={() => {
                        if (loanSearch.length > 0) setShowDropdown(true);
                      }}
                      placeholder="Search by loan number or customer name…"
                      className="min-h-[44px] pl-9 text-base"
                      autoComplete="off"
                      disabled={isSubmitting}
                    />
                  </div>
                  {showDropdown && debouncedSearch.length > 0 && (
                    <ul
                      className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-md"
                      role="listbox"
                    >
                      {loansLoading ? (
                        <li className="flex items-center justify-center px-3 py-3">
                          <LoadingSpinner />
                        </li>
                      ) : loanResults?.data && loanResults.data.filter(l => l.status === 'active' || l.status === 'overdue').length > 0 ? (
                        loanResults.data.filter(l => l.status === 'active' || l.status === 'overdue').map((loan) => (
                          <li
                            key={loan.id}
                            role="option"
                            aria-selected={false}
                            className="cursor-pointer px-3 py-3 text-sm hover:bg-accent"
                            onClick={() => handleSelectLoan(loan)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSelectLoan(loan);
                            }}
                            tabIndex={0}
                          >
                            <span className="font-medium">{loan.loan_number}</span>
                            {loan.customer?.full_name && (
                              <span className="ml-2 text-muted-foreground">
                                — {loan.customer.full_name}
                              </span>
                            )}
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Outstanding:{' '}
                              <MoneyDisplay
                                paise={loan.cached_outstanding_paise ?? 0}
                                className="text-xs"
                              />
                            </div>
                          </li>
                        ))
                      ) : (
                        <li className="px-3 py-3 text-sm text-muted-foreground">
                          No active/overdue loans found
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </div>
            {errors['loan'] && (
              <p className="mt-1.5 text-xs text-destructive">{errors['loan']}</p>
            )}
          </CardContent>
        </Card>

        {/* Amount Input */}
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">Payment Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="amount">Amount (₹)</Label>
              <Input
                id="amount"
                value={amountRupees}
                onChange={(e) => {
                  setAmountRupees(e.target.value);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next['amount'];
                    return next;
                  });
                }}
                inputMode="numeric"
                placeholder="e.g. 5000"
                className="min-h-[44px] text-lg font-semibold"
                disabled={isSubmitting}
              />
              {errors['amount'] && (
                <p className="text-xs text-destructive">{errors['amount']}</p>
              )}
            </div>

            {/* Payment Mode */}
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <div className="grid grid-cols-3 gap-2">
                {PAYMENT_MODES.map((mode) => {
                  const Icon = mode.icon;
                  const isActive = paymentMode === mode.value;
                  return (
                    <button
                      key={mode.value}
                      type="button"
                      onClick={() => setPaymentMode(mode.value)}
                      disabled={isSubmitting}
                      className={`flex min-h-[44px] flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-3 text-sm font-medium transition-colors ${
                        isActive
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-input bg-background text-muted-foreground hover:border-primary/50 hover:bg-accent'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Payment Date */}
            <div className="space-y-1.5">
              <Label htmlFor="paymentDate">Payment Date</Label>
              <Input
                id="paymentDate"
                type="date"
                value={paymentDate}
                onChange={(e) => {
                  setPaymentDate(e.target.value);
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next['date'];
                    return next;
                  });
                }}
                className="min-h-[44px] text-base"
                disabled={isSubmitting}
              />
              {errors['date'] && (
                <p className="text-xs text-destructive">{errors['date']}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Submit Button */}
        <div className="mt-4">
          <Button
            type="submit"
            disabled={isSubmitting}
            className="min-h-[44px] w-full text-base font-semibold"
          >
            {isSubmitting ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Posting…
              </span>
            ) : (
              'Post Collection'
            )}
          </Button>
        </div>
      </form>

      {/* Confirm Dialog */}
      <ConfirmDialog
        open={showConfirm}
        onOpenChange={(open) => {
          if (!isSubmitting) setShowConfirm(open);
        }}
        title="Confirm Collection"
        description="Please verify the collection details before posting."
        confirmLabel="Post Collection"
        loading={isSubmitting}
        onConfirm={handleConfirmPost}
      >
        {selectedLoan && (
          <div className="space-y-2 rounded-lg border bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Loan Number</span>
              <span className="font-medium">{selectedLoan.loan_number}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Customer</span>
              <span className="font-medium">
                {selectedLoan.customer?.full_name ?? '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Amount</span>
              <MoneyDisplay paise={amountPaisePreview} className="font-semibold" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Mode</span>
              <span className="font-medium capitalize">
                {paymentMode.replace('_', ' ')}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{paymentDate}</span>
            </div>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}

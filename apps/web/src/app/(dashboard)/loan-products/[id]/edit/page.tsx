'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { useUpdateLoanProduct, type LoanProduct } from '@/hooks/useLoanProducts';
import { useToast } from '@/providers/toast-provider';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { ErrorMessage, LoadingSpinner, AccessDenied } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculatePeriodicRate } from '@/lib/utils';

interface LoanProductDetail extends LoanProduct {
  current_version?: {
    id: string;
    interest_type: 'flat' | 'reducing_balance';
    annual_rate_bps: number;
    repayment_frequency: 'daily' | 'weekly' | 'monthly';
    min_principal_paise: number;
    max_principal_paise: number;
    min_tenure_months: number;
    max_tenure_months: number;
    processing_fee_type?: string | null;
    processing_fee_value?: number | null;
    penalty_type?: string | null;
    penalty_value?: number | null;
    allocation_order?: string[];
  };
}

export default function EditLoanProductPage() {
  const { user } = useAuth();
  const role = user?.role ?? '';

  if (!hasPermission(role, 'loan_product.update')) {
    return <AccessDenied />;
  }

  return <EditLoanProductContent />;
}

function EditLoanProductContent() {
  const router = useRouter();
  const params = useParams();
  const productId = params['id'] as string;
  const update = useUpdateLoanProduct();
  const { showToast } = useToast();

  const { data: product, isLoading, error: fetchError } = useQuery<LoanProductDetail>({
    queryKey: ['loan-product', productId],
    queryFn: () => apiClient.get(`/loan-products/${productId}`),
    enabled: !!productId,
  });

  const [formData, setFormData] = useState({
    interest_type: 'flat',
    annual_rate: '',
    frequency: 'monthly',
    min_principal: '',
    max_principal: '',
    min_tenure_months: '',
    max_tenure_months: '',
    processing_fee_percent: '',
    penalty_rate_percent: '',
    allocation_order: 'penalty,interest,principal',
  });

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product?.current_version) {
      const v = product.current_version;
      setFormData({
        interest_type: v.interest_type || 'flat',
        annual_rate: ((v.annual_rate_bps || 0) / 100).toString(),
        frequency: v.repayment_frequency || 'monthly',
        min_principal: ((v.min_principal_paise || 0) / 100).toString(),
        max_principal: ((v.max_principal_paise || 0) / 100).toString(),
        min_tenure_months: (v.min_tenure_months || '').toString(),
        max_tenure_months: (v.max_tenure_months || '').toString(),
        processing_fee_percent: v.processing_fee_value ? v.processing_fee_value.toString() : '',
        penalty_rate_percent: v.penalty_value ? v.penalty_value.toString() : '',
        allocation_order: Array.isArray(v.allocation_order) ? v.allocation_order.join(',') : 'penalty,interest,principal',
      });
    }
  }, [product]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!formData.annual_rate || parseFloat(formData.annual_rate) <= 0) {
      setError('Annual rate must be positive.');
      return;
    }
    if (!formData.min_principal || !formData.max_principal) {
      setError('Principal range is required.');
      return;
    }
    const minP = parseFloat(formData.min_principal);
    const maxP = parseFloat(formData.max_principal);
    if (minP > maxP) {
      setError('Min principal cannot be greater than max principal.');
      return;
    }
    if (!formData.min_tenure_months || !formData.max_tenure_months) {
      setError('Tenure range is required.');
      return;
    }
    const minT = parseInt(formData.min_tenure_months);
    const maxT = parseInt(formData.max_tenure_months);
    if (minT > maxT) {
      setError('Min tenure cannot be greater than max tenure.');
      return;
    }

    try {
      await update.mutateAsync({
        id: productId,
        data: {
          interestType: formData.interest_type,
          annualRateBps: Math.round(parseFloat(formData.annual_rate) * 100),
          repaymentFrequency: formData.frequency,
          minPrincipalPaise: Math.round(minP * 100),
          maxPrincipalPaise: Math.round(maxP * 100),
          minTenureMonths: minT,
          maxTenureMonths: maxT,
          processingFeeValue: formData.processing_fee_percent ? parseFloat(formData.processing_fee_percent) : undefined,
          penaltyValue: formData.penalty_rate_percent ? parseFloat(formData.penalty_rate_percent) : undefined,
          allocationOrder: formData.allocation_order.split(',').map(s => s.trim()),
        },
      });
      showToast({ message: 'Loan product updated. A new version was created.' });
      router.push('/loan-products');
    } catch (err) {
      setError((err as Error).message || 'Failed to update loan product.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (fetchError) {
    return <ErrorMessage message={(fetchError as Error).message} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/loan-products"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">Edit Loan Product</h1>
          <p className="text-sm text-muted-foreground">{product?.name}</p>
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Details</CardTitle>
          <p className="text-sm text-muted-foreground">
            Updating creates a new version. Existing loans keep their original terms.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="interest_type">Interest Type *</Label>
                <Select value={formData.interest_type} onValueChange={(v) => setFormData(prev => ({ ...prev, interest_type: v }))}>
                  <SelectTrigger id="interest_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="reducing_balance">Reducing Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="annual_rate">Annual Rate (%) *</Label>
                <Input
                  id="annual_rate"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.annual_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, annual_rate: e.target.value }))}
                  placeholder="e.g., 24.00"
                />
                {formData.annual_rate && parseFloat(formData.annual_rate) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {(() => {
                      const periodic = calculatePeriodicRate(parseFloat(formData.annual_rate), formData.frequency);
                      return `= ${periodic.formatted}% ${periodic.labelLong}`;
                    })()}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="frequency">Repayment Frequency *</Label>
                <Select value={formData.frequency} onValueChange={(v) => setFormData(prev => ({ ...prev, frequency: v }))}>
                  <SelectTrigger id="frequency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="min_principal">Min Principal (Rs) *</Label>
                <Input
                  id="min_principal"
                  type="number"
                  inputMode="numeric"
                  value={formData.min_principal}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_principal: e.target.value }))}
                  placeholder="e.g., 5000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_principal">Max Principal (Rs) *</Label>
                <Input
                  id="max_principal"
                  type="number"
                  inputMode="numeric"
                  value={formData.max_principal}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_principal: e.target.value }))}
                  placeholder="e.g., 100000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="min_tenure_months">Min Tenure (months) *</Label>
                <Input
                  id="min_tenure_months"
                  type="number"
                  inputMode="numeric"
                  value={formData.min_tenure_months}
                  onChange={(e) => setFormData(prev => ({ ...prev, min_tenure_months: e.target.value }))}
                  placeholder="e.g., 3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="max_tenure_months">Max Tenure (months) *</Label>
                <Input
                  id="max_tenure_months"
                  type="number"
                  inputMode="numeric"
                  value={formData.max_tenure_months}
                  onChange={(e) => setFormData(prev => ({ ...prev, max_tenure_months: e.target.value }))}
                  placeholder="e.g., 24"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="processing_fee_percent">Processing Fee (%)</Label>
                <Input
                  id="processing_fee_percent"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.processing_fee_percent}
                  onChange={(e) => setFormData(prev => ({ ...prev, processing_fee_percent: e.target.value }))}
                  placeholder="e.g., 2.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="penalty_rate_percent">Penalty Rate (%)</Label>
                <Input
                  id="penalty_rate_percent"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.penalty_rate_percent}
                  onChange={(e) => setFormData(prev => ({ ...prev, penalty_rate_percent: e.target.value }))}
                  placeholder="e.g., 2.00"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="allocation_order">Allocation Order</Label>
                <Input
                  id="allocation_order"
                  value={formData.allocation_order}
                  onChange={(e) => setFormData(prev => ({ ...prev, allocation_order: e.target.value }))}
                  placeholder="penalty,interest,principal"
                />
                <p className="text-xs text-muted-foreground">
                  Order in which collections are applied. Default: penalty,interest,principal
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button type="submit" disabled={update.isPending} className="min-h-[44px]">
                {update.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="outline" className="min-h-[44px]" asChild>
                <Link href="/loan-products">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

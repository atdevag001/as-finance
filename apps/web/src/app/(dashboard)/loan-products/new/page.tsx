'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCreateLoanProduct } from '@/hooks/useLoanProducts';
import { useToast } from '@/providers/toast-provider';
import { ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { calculatePeriodicRate } from '@/lib/utils';

export default function NewLoanProductPage() {
  const router = useRouter();
  const create = useCreateLoanProduct();
  const { showToast } = useToast();

  const [formData, setFormData] = useState({
    name: '',
    interest_type: 'flat',
    annual_rate: '', // in percent, will convert to bps
    frequency: 'monthly',
    min_principal: '', // in rupees
    max_principal: '', // in rupees
    min_tenure_months: '',
    max_tenure_months: '',
    processing_fee_percent: '',
    penalty_rate_percent: '',
    allocation_order: 'penalty,interest,principal',
  });

  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate
    if (!formData.name.trim()) {
      setError('Product name is required.');
      return;
    }
    if (!formData.annual_rate || parseFloat(formData.annual_rate) <= 0) {
      setError('Annual rate must be positive.');
      return;
    }
    if (!formData.min_principal || !formData.max_principal) {
      setError('Principal range is required.');
      return;
    }
    if (!formData.min_tenure_months || !formData.max_tenure_months) {
      setError('Tenure range is required.');
      return;
    }

    try {
      await create.mutateAsync({
        name: formData.name.trim(),
        interest_type: formData.interest_type,
        annual_rate: Math.round(parseFloat(formData.annual_rate) * 100), // percent to bps
        frequency: formData.frequency,
        min_principal_paise: Math.round(parseFloat(formData.min_principal) * 100),
        max_principal_paise: Math.round(parseFloat(formData.max_principal) * 100),
        min_tenure_months: parseInt(formData.min_tenure_months),
        max_tenure_months: parseInt(formData.max_tenure_months),
        processing_fee_percent: formData.processing_fee_percent ? parseFloat(formData.processing_fee_percent) : undefined,
        penalty_rate_percent: formData.penalty_rate_percent ? parseFloat(formData.penalty_rate_percent) : undefined,
        allocation_order: formData.allocation_order,
      });
      showToast({ message: 'Loan product created.' });
      router.push('/loan-products');
    } catch (err) {
      setError((err as Error).message || 'Failed to create loan product.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/loan-products"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <h1 className="text-2xl font-bold">New Loan Product</h1>
      </div>

      {error && <ErrorMessage message={error} />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Product Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="name">Product Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Personal Loan - Daily"
                />
              </div>

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
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create Product'}
              </Button>
              <Button type="button" variant="outline" asChild>
                <Link href="/loan-products">Cancel</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

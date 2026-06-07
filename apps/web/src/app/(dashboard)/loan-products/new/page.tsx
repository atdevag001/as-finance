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
    interestType: 'flat',
    annualRate: '', // in percent, will convert to bps
    repaymentFrequency: 'monthly',
    minPrincipal: '', // in rupees
    maxPrincipal: '', // in rupees
    minTenureMonths: '',
    maxTenureMonths: '',
    processingFeePercent: '',
    penaltyRatePercent: '',
    allocationOrder: 'penalty,interest,principal',
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
    if (!formData.annualRate || parseFloat(formData.annualRate) <= 0) {
      setError('Annual rate must be positive.');
      return;
    }
    if (!formData.minPrincipal || !formData.maxPrincipal) {
      setError('Principal range is required.');
      return;
    }
    const minP = parseFloat(formData.minPrincipal);
    const maxP = parseFloat(formData.maxPrincipal);
    // Catch inverted ranges here so the user sees inline feedback instead of a generic backend 400.
    if (minP > maxP) {
      setError('Min principal cannot be greater than max principal.');
      return;
    }
    if (!formData.minTenureMonths || !formData.maxTenureMonths) {
      setError('Tenure range is required.');
      return;
    }
    const minT = parseInt(formData.minTenureMonths);
    const maxT = parseInt(formData.maxTenureMonths);
    if (minT > maxT) {
      setError('Min tenure cannot be greater than max tenure.');
      return;
    }

    // Build payload matching backend DTO (camelCase)
    const payload: Record<string, unknown> = {
      name: formData.name.trim(),
      interestType: formData.interestType,
      annualRateBps: Math.round(parseFloat(formData.annualRate) * 100), // percent to bps
      repaymentFrequency: formData.repaymentFrequency,
      minPrincipalPaise: Math.round(minP * 100),
      maxPrincipalPaise: Math.round(maxP * 100),
      minTenureMonths: minT,
      maxTenureMonths: maxT,
      allocationOrder: formData.allocationOrder.split(',').map(s => s.trim()),
    };

    // Add processing fee if specified (as percentage type with bps value)
    if (formData.processingFeePercent && parseFloat(formData.processingFeePercent) > 0) {
      payload['processingFeeType'] = 'percentage';
      payload['processingFeeValue'] = Math.round(parseFloat(formData.processingFeePercent) * 100); // percent to bps
    }

    // Add penalty if specified (as percentage of overdue with bps value)
    if (formData.penaltyRatePercent && parseFloat(formData.penaltyRatePercent) > 0) {
      payload['penaltyType'] = 'percentage_of_overdue';
      payload['penaltyValue'] = Math.round(parseFloat(formData.penaltyRatePercent) * 100); // percent to bps
      payload['penaltyFrequency'] = formData.repaymentFrequency; // Match repayment frequency
      payload['penaltyGraceDays'] = 0;
    }

    try {
      await create.mutateAsync(payload);
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
                <Label htmlFor="interestType">Interest Type *</Label>
                <Select value={formData.interestType} onValueChange={(v) => setFormData(prev => ({ ...prev, interestType: v }))}>
                  <SelectTrigger id="interestType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="reducing_balance">Reducing Balance</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="annualRate">Annual Rate (%) *</Label>
                <Input
                  id="annualRate"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.annualRate}
                  onChange={(e) => setFormData(prev => ({ ...prev, annualRate: e.target.value }))}
                  placeholder="e.g., 24.00"
                />
                <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Periodic Rate: </span>
                  {formData.annualRate && parseFloat(formData.annualRate) > 0 ? (
                    <span className="font-medium text-foreground">
                      {(() => {
                        const periodic = calculatePeriodicRate(parseFloat(formData.annualRate), formData.repaymentFrequency);
                        return `${periodic.formatted}% ${periodic.labelLong}`;
                      })()}
                    </span>
                  ) : (
                    <span className="text-muted-foreground italic">Enter annual rate to calculate</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="repaymentFrequency">Repayment Frequency *</Label>
                <Select value={formData.repaymentFrequency} onValueChange={(v) => setFormData(prev => ({ ...prev, repaymentFrequency: v }))}>
                  <SelectTrigger id="repaymentFrequency">
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
                <Label htmlFor="minPrincipal">Min Principal (Rs) *</Label>
                <Input
                  id="minPrincipal"
                  type="number"
                  inputMode="numeric"
                  value={formData.minPrincipal}
                  onChange={(e) => setFormData(prev => ({ ...prev, minPrincipal: e.target.value }))}
                  placeholder="e.g., 5000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxPrincipal">Max Principal (Rs) *</Label>
                <Input
                  id="maxPrincipal"
                  type="number"
                  inputMode="numeric"
                  value={formData.maxPrincipal}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxPrincipal: e.target.value }))}
                  placeholder="e.g., 100000"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="minTenureMonths">Min Tenure (months) *</Label>
                <Input
                  id="minTenureMonths"
                  type="number"
                  inputMode="numeric"
                  value={formData.minTenureMonths}
                  onChange={(e) => setFormData(prev => ({ ...prev, minTenureMonths: e.target.value }))}
                  placeholder="e.g., 3"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxTenureMonths">Max Tenure (months) *</Label>
                <Input
                  id="maxTenureMonths"
                  type="number"
                  inputMode="numeric"
                  value={formData.maxTenureMonths}
                  onChange={(e) => setFormData(prev => ({ ...prev, maxTenureMonths: e.target.value }))}
                  placeholder="e.g., 24"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="processingFeePercent">Processing Fee (%)</Label>
                <Input
                  id="processingFeePercent"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.processingFeePercent}
                  onChange={(e) => setFormData(prev => ({ ...prev, processingFeePercent: e.target.value }))}
                  placeholder="e.g., 2.00"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="penaltyRatePercent">Penalty Rate (%)</Label>
                <Input
                  id="penaltyRatePercent"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={formData.penaltyRatePercent}
                  onChange={(e) => setFormData(prev => ({ ...prev, penaltyRatePercent: e.target.value }))}
                  placeholder="e.g., 2.00"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="allocationOrder">Allocation Order</Label>
                <Input
                  id="allocationOrder"
                  value={formData.allocationOrder}
                  onChange={(e) => setFormData(prev => ({ ...prev, allocationOrder: e.target.value }))}
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

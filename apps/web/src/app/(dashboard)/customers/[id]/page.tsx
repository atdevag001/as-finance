'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useCustomer } from '@/hooks/useCustomers';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: customer, isLoading, error } = useCustomer(id);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!customer) return <ErrorMessage message="Customer not found" />;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild><Link href="/customers"><ArrowLeft className="h-4 w-4" /></Link></Button>
        <div>
          <h1 className="text-2xl font-bold">{customer.fullName}</h1>
          <StatusBadge status={customer.status} type="customer" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Personal Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Father/Husband" value={customer.fatherOrHusbandName} />
            <Row label="Mobile" value={customer.mobile} />
            <Row label="Gender" value={customer.gender} />
            <Row label="Aadhaar" value={`XXXX-XXXX-${customer.aadhaarLastFour}`} />
            {customer.panLastFour && <Row label="PAN" value={`XXXXXX${customer.panLastFour}`} />}
            {customer.occupation && <Row label="Occupation" value={customer.occupation} />}
            {customer.monthlyIncomePaise != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Income</span>
                <MoneyDisplay paise={customer.monthlyIncomePaise} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{customer.addressLine1}</p>
            {customer.addressLine2 && <p>{customer.addressLine2}</p>}
            <p>{customer.city}, {customer.district}</p>
            <p>{customer.state} — {customer.pincode}</p>
          </CardContent>
        </Card>
      </div>

      {customer.familyMembers.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Family Members</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {customer.familyMembers.map((f) => (
                <div key={f.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{f.name} ({f.relationship})</span>
                  <span className="text-muted-foreground">{f.contactNumber ?? '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {customer.guarantors.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Guarantors</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {customer.guarantors.map((g) => (
                <div key={g.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{g.name} ({g.relationship})</span>
                  <span className="text-muted-foreground">{g.mobile}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value ?? '—'}</span>
    </div>
  );
}

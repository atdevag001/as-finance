'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, ShieldBan, ShieldCheck } from 'lucide-react';
import { useCustomer } from '@/hooks/useCustomers';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage, PermissionGate, ConfirmDialog } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient, getAccessToken } from '@/lib/api-client';
import { useToast } from '@/providers/toast-provider';
import { useQueryClient, useQuery } from '@tanstack/react-query';

interface LinkedLoan {
  id: string;
  loan_number: string;
  principal_paise: number;
  status: string;
  cached_outstanding_paise?: number;
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: customer, isLoading, error } = useCustomer(id);
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Linked loans query
  const { data: loansData } = useQuery<{ data: LinkedLoan[] }>({
    queryKey: ['loans', 'customer', id],
    queryFn: () => apiClient.get(`/loans?customerId=${id}&take=100`),
    enabled: !!id && !!customer,
  });
  const linkedLoans = loansData?.data ?? [];

  // Document upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Blacklist state
  const [showBlacklistDialog, setShowBlacklistDialog] = useState(false);
  const [blacklistReason, setBlacklistReason] = useState('');
  const [blacklisting, setBlacklisting] = useState(false);

  // Reinstate state
  const [showReinstateDialog, setShowReinstateDialog] = useState(false);
  const [reinstating, setReinstating] = useState(false);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) {
    const errMsg = (error as Error).message;
    if (errMsg?.toLowerCase().includes('not found') || (error as { statusCode?: number }).statusCode === 404) {
      return <ErrorMessage message="Customer not found" />;
    }
    return <ErrorMessage message={errMsg} />;
  }
  if (!customer) return <ErrorMessage message="Customer not found" />;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError(null);

    const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setUploadError('Only JPEG, PNG, and PDF files are allowed.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('File size must be under 5MB.');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('customerId', id);
      await fetch(`${process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3001'}/documents/upload`, {
        method: 'POST',
        body: formData,
        headers: {
          Authorization: `Bearer ${getAccessToken()}`,
        },
      });
      showToast({ message: 'Document uploaded successfully.' });
      queryClient.invalidateQueries({ queryKey: ['customers', id] });
    } catch (err) {
      setUploadError((err as Error).message || 'Upload failed.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleBlacklist() {
    if (!blacklistReason.trim()) return;
    setBlacklisting(true);
    try {
      await apiClient.post(`/customers/${id}/blacklist`, { reason: blacklistReason });
      showToast({ message: 'Customer blacklisted.' });
      setShowBlacklistDialog(false);
      setBlacklistReason('');
      queryClient.invalidateQueries({ queryKey: ['customers', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (err) {
      showToast({ message: (err as Error).message || 'Blacklist failed.', variant: 'error' });
    } finally {
      setBlacklisting(false);
    }
  }

  async function handleReinstate() {
    setReinstating(true);
    try {
      await apiClient.post(`/customers/${id}/reinstate`);
      showToast({ message: 'Customer reinstated.' });
      setShowReinstateDialog(false);
      queryClient.invalidateQueries({ queryKey: ['customers', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (err) {
      showToast({ message: (err as Error).message || 'Reinstate failed.', variant: 'error' });
    } finally {
      setReinstating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/customers"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{customer.full_name}</h1>
          <StatusBadge status={customer.status} type="customer" />
        </div>
        <div className="flex gap-2">
          <PermissionGate permission="customer.blacklist">
            {customer.status === 'active' && (
              <Button variant="destructive" size="sm" onClick={() => setShowBlacklistDialog(true)}>
                <ShieldBan className="mr-1 h-4 w-4" /> Blacklist
              </Button>
            )}
            {customer.status === 'blacklisted' && (
              <Button variant="outline" size="sm" onClick={() => setShowReinstateDialog(true)}>
                <ShieldCheck className="mr-1 h-4 w-4" /> Reinstate
              </Button>
            )}
          </PermissionGate>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">Personal Info</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Row label="Father/Husband" value={customer.father_or_husband_name} />
            <Row label="Mobile" value={customer.mobile} />
            <Row label="Gender" value={customer.gender} />
            <Row label="Aadhaar" value={`XXXX-XXXX-${customer.aadhaar_last_four}`} />
            {customer.pan_last_four && <Row label="PAN" value={`XXXXXX${customer.pan_last_four}`} />}
            {customer.occupation && <Row label="Occupation" value={customer.occupation} />}
            {customer.monthly_income_paise != null && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Monthly Income</span>
                <MoneyDisplay paise={customer.monthly_income_paise} />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Address</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{customer.address_line1}</p>
            {customer.address_line2 && <p>{customer.address_line2}</p>}
            <p>{customer.city}, {customer.district}</p>
            <p>{customer.state} — {customer.pincode}</p>
          </CardContent>
        </Card>
      </div>

      {customer.family_members && customer.family_members.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Family Members</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              {customer.family_members.map((f) => (
                <div key={f.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{f.name} ({f.relationship})</span>
                  <span className="text-muted-foreground">{f.contact_number ?? '—'}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {customer.guarantors && customer.guarantors.length > 0 && (
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

      {/* Document Upload Section */}
      <PermissionGate permission="customer.upload_doc">
        <Card>
          <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.pdf"
                  onChange={handleFileUpload}
                  disabled={uploading}
                  className="hidden"
                  id="doc-upload"
                />
                <Button
                  variant="outline"
                  size="sm"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1 h-4 w-4" />
                  {uploading ? 'Uploading…' : 'Upload Document'}
                </Button>
                <span className="text-xs text-muted-foreground">JPEG, PNG, PDF — max 5MB</span>
              </div>
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            </div>
          </CardContent>
        </Card>
      </PermissionGate>

      {/* Linked Loans Section */}
      {linkedLoans.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Linked Loans</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Loan Number</th>
                    <th className="pb-2 font-medium">Principal</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {linkedLoans.map((loan) => (
                    <tr key={loan.id} className="border-b last:border-0">
                      <td className="py-2">
                        <Link href={`/loans/${loan.id}`} className="text-primary underline-offset-4 hover:underline">
                          {loan.loan_number}
                        </Link>
                      </td>
                      <td className="py-2"><MoneyDisplay paise={loan.principal_paise} /></td>
                      <td className="py-2"><StatusBadge status={loan.status} type="loan" /></td>
                      <td className="py-2 text-right">
                        <MoneyDisplay paise={loan.cached_outstanding_paise ?? 0} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blacklist Confirm Dialog */}
      <ConfirmDialog
        open={showBlacklistDialog}
        onOpenChange={setShowBlacklistDialog}
        title="Blacklist Customer"
        description={`Are you sure you want to blacklist ${customer.full_name}? This will prevent new loan applications.`}
        confirmLabel="Blacklist"
        variant="destructive"
        loading={blacklisting}
        onConfirm={handleBlacklist}
      >
        <div className="py-2">
          <label htmlFor="blacklist-reason" className="text-sm font-medium">Reason</label>
          <Input
            id="blacklist-reason"
            placeholder="Enter reason for blacklisting…"
            value={blacklistReason}
            onChange={(e) => setBlacklistReason(e.target.value)}
            className="mt-1"
          />
        </div>
      </ConfirmDialog>

      {/* Reinstate Confirm Dialog */}
      <ConfirmDialog
        open={showReinstateDialog}
        onOpenChange={setShowReinstateDialog}
        title="Reinstate Customer"
        description={`Are you sure you want to reinstate ${customer.full_name}?`}
        confirmLabel="Reinstate"
        loading={reinstating}
        onConfirm={handleReinstate}
      />
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

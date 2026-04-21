'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Upload, ShieldBan, ShieldCheck, Plus, Pencil, Eye, ExternalLink } from 'lucide-react';
import { useCustomer, useUpdateCustomer, useAddFamilyMember, useAddGuarantor } from '@/hooks/useCustomers';
import { StatusBadge, MoneyDisplay, LoadingSpinner, ErrorMessage, PermissionGate, ConfirmDialog, DateDisplay, TappablePhone } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

interface Document {
  id: string;
  document_type: string;
  file_name: string;
  uploaded_at: string;
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: customer, isLoading, error } = useCustomer(id);
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const updateCustomer = useUpdateCustomer();
  const addFamilyMember = useAddFamilyMember();
  const addGuarantor = useAddGuarantor();

  // Linked loans query
  const { data: loansData } = useQuery<{ data: LinkedLoan[] }>({
    queryKey: ['loans', 'customer', id],
    queryFn: () => apiClient.get(`/loans?customerId=${id}&take=100`),
    enabled: !!id && !!customer,
  });
  const linkedLoans = loansData?.data ?? [];

  // Documents query
  const { data: documentsData } = useQuery<{ data: Document[] }>({
    queryKey: ['customers', id, 'documents'],
    queryFn: () => apiClient.get(`/customers/${id}/documents`),
    enabled: !!id && !!customer,
  });
  const documents = documentsData?.data ?? [];

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
  const [reinstateReason, setReinstateReason] = useState('');

  // Edit form state
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editFormData, setEditFormData] = useState<Record<string, string>>({});
  const [editError, setEditError] = useState<string | null>(null);

  // Add Family Member state
  const [showAddFamilyDialog, setShowAddFamilyDialog] = useState(false);
  const [familyFormData, setFamilyFormData] = useState({
    name: '',
    relationship: '',
    contactNumber: '',
    occupation: '',
  });
  const [familyError, setFamilyError] = useState<string | null>(null);

  // Add Guarantor state
  const [showAddGuarantorDialog, setShowAddGuarantorDialog] = useState(false);
  const [guarantorFormData, setGuarantorFormData] = useState({
    name: '',
    relationship: '',
    mobile: '',
    aadhaarNumber: '',
    address: '',
  });
  const [guarantorError, setGuarantorError] = useState<string | null>(null);

  // View document loading state
  const [viewingDocId, setViewingDocId] = useState<string | null>(null);

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
      await apiClient.post(`/customers/${id}/reinstate`, { reason: reinstateReason || 'Reinstated by manager' });
      showToast({ message: 'Customer reinstated.' });
      setShowReinstateDialog(false);
      setReinstateReason('');
      queryClient.invalidateQueries({ queryKey: ['customers', id] });
      queryClient.invalidateQueries({ queryKey: ['customers'] });
    } catch (err) {
      showToast({ message: (err as Error).message || 'Reinstate failed.', variant: 'error' });
    } finally {
      setReinstating(false);
    }
  }

  function openEditDialog() {
    if (!customer) return;
    setEditFormData({
      fullName: customer.full_name || '',
      fatherOrHusbandName: customer.father_or_husband_name || '',
      mobile: customer.mobile || '',
      alternateMobile: customer.alternate_mobile || '',
      occupation: customer.occupation || '',
      monthlyIncomeRupees: customer.monthly_income_paise ? String(customer.monthly_income_paise / 100) : '',
      addressLine1: customer.address_line1 || '',
      addressLine2: customer.address_line2 || '',
      city: customer.city || '',
      district: customer.district || '',
      state: customer.state || '',
      pincode: customer.pincode || '',
      notes: customer.notes || '',
    });
    setEditError(null);
    setShowEditDialog(true);
  }

  async function handleUpdateCustomer() {
    if (!customer) return;
    setEditError(null);
    try {
      // Only send changed fields
      const changedFields: Record<string, unknown> = {};
      const originalData: Record<string, string> = {
        fullName: customer.full_name || '',
        fatherOrHusbandName: customer.father_or_husband_name || '',
        mobile: customer.mobile || '',
        alternateMobile: customer.alternate_mobile || '',
        occupation: customer.occupation || '',
        monthlyIncomeRupees: customer.monthly_income_paise ? String(customer.monthly_income_paise / 100) : '',
        addressLine1: customer.address_line1 || '',
        addressLine2: customer.address_line2 || '',
        city: customer.city || '',
        district: customer.district || '',
        state: customer.state || '',
        pincode: customer.pincode || '',
        notes: customer.notes || '',
      };

      for (const [key, value] of Object.entries(editFormData)) {
        if (value !== originalData[key]) {
          if (key === 'monthlyIncomeRupees') {
            changedFields['monthlyIncomePaise'] = Math.round(parseFloat(value || '0') * 100);
          } else {
            changedFields[key] = value;
          }
        }
      }

      if (Object.keys(changedFields).length === 0) {
        setShowEditDialog(false);
        return;
      }

      await updateCustomer.mutateAsync({ id, data: changedFields });
      showToast({ message: 'Customer updated successfully.' });
      setShowEditDialog(false);
    } catch (err) {
      setEditError((err as Error).message || 'Failed to update customer.');
    }
  }

  async function handleAddFamilyMember() {
    setFamilyError(null);
    if (!familyFormData.name.trim() || !familyFormData.relationship.trim()) {
      setFamilyError('Name and relationship are required.');
      return;
    }
    try {
      await addFamilyMember.mutateAsync({
        customerId: id,
        data: familyFormData,
      });
      showToast({ message: 'Family member added.' });
      setShowAddFamilyDialog(false);
      setFamilyFormData({ name: '', relationship: '', contactNumber: '', occupation: '' });
    } catch (err) {
      setFamilyError((err as Error).message || 'Failed to add family member.');
    }
  }

  async function handleAddGuarantor() {
    setGuarantorError(null);
    if (!guarantorFormData.name.trim() || !guarantorFormData.relationship.trim() || !guarantorFormData.mobile.trim() || !guarantorFormData.aadhaarNumber.trim() || !guarantorFormData.address.trim()) {
      setGuarantorError('Name, relationship, mobile, Aadhaar number, and address are required.');
      return;
    }
    try {
      await addGuarantor.mutateAsync({
        customerId: id,
        data: guarantorFormData,
      });
      showToast({ message: 'Guarantor added.' });
      setShowAddGuarantorDialog(false);
      setGuarantorFormData({ name: '', relationship: '', mobile: '', aadhaarNumber: '', address: '' });
    } catch (err) {
      setGuarantorError((err as Error).message || 'Failed to add guarantor.');
    }
  }

  async function handleViewDocument(docId: string) {
    setViewingDocId(docId);
    try {
      const { url } = await apiClient.get<{ url: string }>(`/documents/${docId}/url`);
      window.open(url, '_blank');
    } catch (err) {
      showToast({ message: (err as Error).message || 'Failed to get document URL.', variant: 'error' });
    } finally {
      setViewingDocId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" asChild>
            <Link href="/customers"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{customer.full_name}</h1>
            <StatusBadge status={customer.status} type="customer" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="customer.update">
            <Button variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none" onClick={openEditDialog}>
              <Pencil className="mr-1 h-4 w-4" /> Edit
            </Button>
          </PermissionGate>
          <PermissionGate permission="customer.blacklist">
            {customer.status === 'active' && (
              <Button variant="destructive" size="sm" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => setShowBlacklistDialog(true)}>
                <ShieldBan className="mr-1 h-4 w-4" /> Blacklist
              </Button>
            )}
            {customer.status === 'blacklisted' && (
              <Button variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => setShowReinstateDialog(true)}>
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
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mobile</span>
              <TappablePhone phone={customer.mobile} />
            </div>
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

      {/* Family Members */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Family Members</CardTitle>
          <PermissionGate permission="customer.update">
            <Button variant="outline" size="sm" onClick={() => setShowAddFamilyDialog(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </PermissionGate>
        </CardHeader>
        <CardContent>
          {customer.family_members && customer.family_members.length > 0 ? (
            <div className="space-y-2 text-sm">
              {customer.family_members.map((f) => (
                <div key={f.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{f.name} ({f.relationship})</span>
                  <span className="text-muted-foreground">{f.contact_number ?? '—'}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No family members added.</p>
          )}
        </CardContent>
      </Card>

      {/* Guarantors */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Guarantors</CardTitle>
          <PermissionGate permission="customer.update">
            <Button variant="outline" size="sm" onClick={() => setShowAddGuarantorDialog(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add
            </Button>
          </PermissionGate>
        </CardHeader>
        <CardContent>
          {customer.guarantors && customer.guarantors.length > 0 ? (
            <div className="space-y-2 text-sm">
              {customer.guarantors.map((g) => (
                <div key={g.id} className="flex justify-between border-b pb-2 last:border-0">
                  <span>{g.name} ({g.relationship})</span>
                  <span className="text-muted-foreground">{g.mobile}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No guarantors added.</p>
          )}
        </CardContent>
      </Card>

      {/* Documents Section */}
      <Card>
        <CardHeader><CardTitle className="text-base">Documents</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Document List */}
            {documents.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Type</th>
                      <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">File Name</th>
                      <th className="px-3 py-2 text-left font-medium hidden md:table-cell">Uploaded</th>
                      <th className="px-3 py-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => (
                      <tr key={doc.id} className="border-b last:border-0">
                        <td className="px-3 py-2 capitalize">{doc.document_type.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2 hidden sm:table-cell truncate max-w-40">{doc.file_name}</td>
                        <td className="px-3 py-2 hidden md:table-cell">
                          <DateDisplay date={doc.uploaded_at} />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={viewingDocId === doc.id}
                            onClick={() => handleViewDocument(doc.id)}
                          >
                            {viewingDocId === doc.id ? (
                              <LoadingSpinner size="sm" />
                            ) : (
                              <>
                                <ExternalLink className="mr-1 h-4 w-4" />
                                View
                              </>
                            )}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {documents.length === 0 && (
              <p className="text-sm text-muted-foreground">No documents uploaded.</p>
            )}

            {/* Upload Section */}
            <PermissionGate permission="customer.upload_doc">
              <div className="flex items-center gap-3 pt-2 border-t">
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
            </PermissionGate>
          </div>
        </CardContent>
      </Card>

      {/* Linked Loans Section */}
      {linkedLoans.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Linked Loans</CardTitle></CardHeader>
          <CardContent>
            {/* Mobile Card View */}
            <div className="space-y-3 lg:hidden">
              {linkedLoans.map((loan) => (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-accent/50 active:bg-accent"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-primary">{loan.loan_number}</p>
                      <p className="text-sm text-muted-foreground">
                        Principal: <MoneyDisplay paise={loan.principal_paise} />
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <MoneyDisplay paise={loan.cached_outstanding_paise ?? 0} className="font-medium" />
                      <p className="text-xs text-muted-foreground">Outstanding</p>
                    </div>
                  </div>
                  <div className="mt-2">
                    <StatusBadge status={loan.status} type="loan" />
                  </div>
                </Link>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto">
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
        onOpenChange={(open) => {
          setShowReinstateDialog(open);
          if (!open) setReinstateReason('');
        }}
        title="Reinstate Customer"
        description={`Are you sure you want to reinstate ${customer.full_name}?`}
        confirmLabel="Reinstate"
        loading={reinstating}
        onConfirm={handleReinstate}
      >
        <div className="py-2">
          <label htmlFor="reinstate-reason" className="text-sm font-medium">Reason (optional)</label>
          <Input
            id="reinstate-reason"
            placeholder="Enter reason for reinstating…"
            value={reinstateReason}
            onChange={(e) => setReinstateReason(e.target.value)}
            className="mt-1"
          />
        </div>
      </ConfirmDialog>

      {/* Edit Customer Dialog */}
      <ConfirmDialog
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        title="Edit Customer"
        description="Update customer information."
        confirmLabel={updateCustomer.isPending ? 'Saving…' : 'Save Changes'}
        loading={updateCustomer.isPending}
        onConfirm={handleUpdateCustomer}
      >
        <div className="space-y-4 py-2 max-h-96 overflow-y-auto">
          {editError && <p className="text-sm text-destructive">{editError}</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-fullName">Full Name</Label>
              <Input
                id="edit-fullName"
                value={editFormData['fullName'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, fullName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-fatherOrHusbandName">Father/Husband Name</Label>
              <Input
                id="edit-fatherOrHusbandName"
                value={editFormData['fatherOrHusbandName'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, fatherOrHusbandName: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-mobile">Mobile</Label>
              <Input
                id="edit-mobile"
                value={editFormData['mobile'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, mobile: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-alternateMobile">Alternate Mobile</Label>
              <Input
                id="edit-alternateMobile"
                value={editFormData['alternateMobile'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, alternateMobile: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-occupation">Occupation</Label>
              <Input
                id="edit-occupation"
                value={editFormData['occupation'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, occupation: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-monthlyIncomeRupees">Monthly Income (₹)</Label>
              <Input
                id="edit-monthlyIncomeRupees"
                type="number"
                inputMode="numeric"
                value={editFormData['monthlyIncomeRupees'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, monthlyIncomeRupees: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-addressLine1">Address Line 1</Label>
              <Input
                id="edit-addressLine1"
                value={editFormData['addressLine1'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, addressLine1: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-addressLine2">Address Line 2</Label>
              <Input
                id="edit-addressLine2"
                value={editFormData['addressLine2'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, addressLine2: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-city">City</Label>
              <Input
                id="edit-city"
                value={editFormData['city'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-district">District</Label>
              <Input
                id="edit-district"
                value={editFormData['district'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, district: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-state">State</Label>
              <Input
                id="edit-state"
                value={editFormData['state'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, state: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-pincode">Pincode</Label>
              <Input
                id="edit-pincode"
                value={editFormData['pincode'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, pincode: e.target.value }))}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="edit-notes">Notes</Label>
              <Input
                id="edit-notes"
                value={editFormData['notes'] ?? ''}
                onChange={(e) => setEditFormData(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
          </div>
        </div>
      </ConfirmDialog>

      {/* Add Family Member Dialog */}
      <ConfirmDialog
        open={showAddFamilyDialog}
        onOpenChange={(open) => {
          setShowAddFamilyDialog(open);
          if (!open) {
            setFamilyFormData({ name: '', relationship: '', contactNumber: '', occupation: '' });
            setFamilyError(null);
          }
        }}
        title="Add Family Member"
        description="Enter family member details."
        confirmLabel={addFamilyMember.isPending ? 'Adding…' : 'Add Member'}
        loading={addFamilyMember.isPending}
        onConfirm={handleAddFamilyMember}
      >
        <div className="space-y-4 py-2">
          {familyError && <p className="text-sm text-destructive">{familyError}</p>}
          <div className="space-y-2">
            <Label htmlFor="family-name">Name *</Label>
            <Input
              id="family-name"
              value={familyFormData.name}
              onChange={(e) => setFamilyFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter name…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="family-relationship">Relationship *</Label>
            <Select value={familyFormData.relationship} onValueChange={(v) => setFamilyFormData(prev => ({ ...prev, relationship: v }))}>
              <SelectTrigger id="family-relationship">
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="father">Father</SelectItem>
                <SelectItem value="mother">Mother</SelectItem>
                <SelectItem value="spouse">Spouse</SelectItem>
                <SelectItem value="sibling">Sibling</SelectItem>
                <SelectItem value="child">Child</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="family-contact">Contact Number</Label>
            <Input
              id="family-contact"
              value={familyFormData.contactNumber}
              onChange={(e) => setFamilyFormData(prev => ({ ...prev, contactNumber: e.target.value }))}
              placeholder="Enter phone number…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="family-occupation">Occupation</Label>
            <Input
              id="family-occupation"
              value={familyFormData.occupation}
              onChange={(e) => setFamilyFormData(prev => ({ ...prev, occupation: e.target.value }))}
              placeholder="Enter occupation…"
            />
          </div>
        </div>
      </ConfirmDialog>

      {/* Add Guarantor Dialog */}
      <ConfirmDialog
        open={showAddGuarantorDialog}
        onOpenChange={(open) => {
          setShowAddGuarantorDialog(open);
          if (!open) {
            setGuarantorFormData({ name: '', relationship: '', mobile: '', aadhaarNumber: '', address: '' });
            setGuarantorError(null);
          }
        }}
        title="Add Guarantor"
        description="Enter guarantor details."
        confirmLabel={addGuarantor.isPending ? 'Adding…' : 'Add Guarantor'}
        loading={addGuarantor.isPending}
        onConfirm={handleAddGuarantor}
      >
        <div className="space-y-4 py-2">
          {guarantorError && <p className="text-sm text-destructive">{guarantorError}</p>}
          <div className="space-y-2">
            <Label htmlFor="guarantor-name">Name *</Label>
            <Input
              id="guarantor-name"
              value={guarantorFormData.name}
              onChange={(e) => setGuarantorFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter name…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guarantor-relationship">Relationship *</Label>
            <Select value={guarantorFormData.relationship} onValueChange={(v) => setGuarantorFormData(prev => ({ ...prev, relationship: v }))}>
              <SelectTrigger id="guarantor-relationship">
                <SelectValue placeholder="Select relationship" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friend">Friend</SelectItem>
                <SelectItem value="relative">Relative</SelectItem>
                <SelectItem value="employer">Employer</SelectItem>
                <SelectItem value="neighbor">Neighbor</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="guarantor-mobile">Mobile *</Label>
            <Input
              id="guarantor-mobile"
              value={guarantorFormData.mobile}
              onChange={(e) => setGuarantorFormData(prev => ({ ...prev, mobile: e.target.value }))}
              placeholder="Enter mobile number…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guarantor-aadhaar">Aadhaar Number *</Label>
            <Input
              id="guarantor-aadhaar"
              value={guarantorFormData.aadhaarNumber}
              onChange={(e) => setGuarantorFormData(prev => ({ ...prev, aadhaarNumber: e.target.value }))}
              placeholder="Enter Aadhaar number…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="guarantor-address">Address *</Label>
            <Input
              id="guarantor-address"
              value={guarantorFormData.address}
              onChange={(e) => setGuarantorFormData(prev => ({ ...prev, address: e.target.value }))}
              placeholder="Enter address…"
            />
          </div>
        </div>
      </ConfirmDialog>
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

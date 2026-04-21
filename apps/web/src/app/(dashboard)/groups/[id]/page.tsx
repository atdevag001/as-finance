'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import { useGroup, useAddGroupMember, usePostGroupCollection, type GroupMember } from '@/hooks/useGroups';
import { useCustomers, type Customer } from '@/hooks/useCustomers';
import { useToast } from '@/providers/toast-provider';
import {
  StatusBadge,
  MoneyDisplay,
  LoadingSpinner,
  ErrorMessage,
  DateDisplay,
  PermissionGate,
  ConfirmDialog,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const { data: group, isLoading, error } = useGroup(id);
  const addMember = useAddGroupMember();
  const postGroupCollection = usePostGroupCollection();
  const { showToast } = useToast();

  // Add member dialog
  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [addMemberError, setAddMemberError] = useState<string | null>(null);

  // Customer search for add member
  const [memberSearch, setMemberSearch] = useState('');
  const [debouncedMemberSearch, setDebouncedMemberSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showMemberDropdown, setShowMemberDropdown] = useState(false);
  const memberDropdownRef = useRef<HTMLDivElement>(null);

  // Debounce member search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedMemberSearch(memberSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [memberSearch]);

  const { data: customerResults } = useCustomers({
    search: debouncedMemberSearch || undefined,
    page: 1,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (memberDropdownRef.current && !memberDropdownRef.current.contains(e.target as Node)) {
        setShowMemberDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Group collection state
  const [collectOpen, setCollectOpen] = useState(false);
  const [payments, setPayments] = useState<Record<string, string>>({});
  const [collectError, setCollectError] = useState<string | null>(null);

  if (isLoading) return <div className="flex justify-center py-8"><LoadingSpinner size="lg" /></div>;
  if (error) return <ErrorMessage message={(error as Error).message} />;
  if (!group) return <ErrorMessage message="Group not found" />;

  async function handleAddMember() {
    if (!selectedCustomer) {
      setAddMemberError('Please select a customer');
      return;
    }
    setAddMemberError(null);
    try {
      await addMember.mutateAsync({ groupId: id, customerId: selectedCustomer.id });
      setAddMemberOpen(false);
      setSelectedCustomer(null);
      setMemberSearch('');
      showToast({ message: 'Member added successfully' });
    } catch (err) {
      setAddMemberError((err as Error).message || 'Failed to add member');
    }
  }

  function selectCustomerForMember(customer: Customer) {
    setSelectedCustomer(customer);
    setMemberSearch(customer.full_name);
    setShowMemberDropdown(false);
  }

  function clearSelectedCustomer() {
    setSelectedCustomer(null);
    setMemberSearch('');
  }

  function openCollectionForm() {
    const initial: Record<string, string> = {};
    (group?.members ?? []).forEach((m: GroupMember) => {
      initial[m.customer_id] = '';
    });
    setPayments(initial);
    setCollectError(null);
    setCollectOpen(true);
  }

  async function handlePostGroupCollection() {
    setCollectError(null);
    const memberBreakdown = Object.entries(payments)
      .filter(([, amt]) => amt && Number(amt) > 0)
      .map(([customerId, amt]) => {
        const member = group!.members.find((m: GroupMember) => m.customer_id === customerId);
        return {
          loanId: member?.loan_id!,
          amountPaise: Math.round(Number(amt) * 100),
        };
      })
      .filter((item) => item.loanId);

    if (memberBreakdown.length === 0) {
      setCollectError('Enter at least one payment amount for members with active loans');
      return;
    }

    const totalAmountPaise = memberBreakdown.reduce((sum, item) => sum + item.amountPaise, 0);

    try {
      await postGroupCollection.mutateAsync({
        groupId: id,
        totalAmountPaise,
        collectionDate: new Date().toISOString().slice(0, 10),
        paymentMode: 'cash',
        idempotencyKey: crypto.randomUUID(),
        memberBreakdown,
      });
      setCollectOpen(false);
      showToast({ message: 'Group collection posted successfully' });
    } catch (err) {
      setCollectError((err as Error).message || 'Failed to post group collection');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" asChild>
            <Link href="/groups"><ArrowLeft className="h-5 w-5" /></Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold truncate">{group.name}</h1>
            <StatusBadge status={group.status} type="group" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <PermissionGate permission="group.manage_members">
            <Button variant="outline" size="sm" className="min-h-[44px] flex-1 sm:flex-none" onClick={() => setAddMemberOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Member
            </Button>
          </PermissionGate>
          <PermissionGate permission="group.collect">
            <Button size="sm" className="min-h-[44px] flex-1 sm:flex-none" onClick={openCollectionForm}>
              Post Collection
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Group Info */}
      <Card>
        <CardHeader><CardTitle className="text-base">Group Info</CardTitle></CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Leader" value={group.leader_name} />
          <Row label="Meeting Day" value={group.meeting_day} />
          <Row label="Members" value={String(group.member_count)} />
          <Row label="Status" value={group.status} />
        </CardContent>
      </Card>

      {/* Members */}
      <Card>
        <CardHeader><CardTitle className="text-base">Members</CardTitle></CardHeader>
        <CardContent>
          {group.members && group.members.length > 0 ? (
            <>
              {/* Mobile Card View */}
              <div className="space-y-3 lg:hidden">
                {group.members.map((m: GroupMember) => (
                  <div key={m.id} className="rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{m.customer_name}</p>
                        {m.loan_id && (
                          <Link href={`/loans/${m.loan_id}`} className="text-sm text-primary hover:underline">
                            {m.loan_number ?? m.loan_id.slice(0, 8)}
                          </Link>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {m.outstanding_paise != null ? (
                          <>
                            <MoneyDisplay paise={Number(m.outstanding_paise)} className="font-medium" />
                            <p className="text-xs text-muted-foreground">Outstanding</p>
                          </>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Customer</th>
                      <th className="px-3 py-2 text-left font-medium">Loan #</th>
                      <th className="px-3 py-2 text-right font-medium">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.members.map((m: GroupMember) => (
                      <tr key={m.id} className="border-b last:border-0">
                        <td className="px-3 py-2">{m.customer_name}</td>
                        <td className="px-3 py-2">
                          {m.loan_id ? (
                            <Link href={`/loans/${m.loan_id}`} className="text-primary hover:underline">
                              {m.loan_number ?? m.loan_id.slice(0, 8)}
                            </Link>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {m.outstanding_paise != null
                            ? <MoneyDisplay paise={Number(m.outstanding_paise)} />
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Collection History */}
      <Card>
        <CardHeader><CardTitle className="text-base">Collection History</CardTitle></CardHeader>
        <CardContent>
          {group.collections && group.collections.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/50">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Date</th>
                    <th className="px-3 py-2 text-right font-medium">Total Amount</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {group.collections.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2"><DateDisplay date={c.payment_date} /></td>
                      <td className="px-3 py-2 text-right"><MoneyDisplay paise={Number(c.total_amount_paise)} /></td>
                      <td className="px-3 py-2"><StatusBadge status={c.status} type="collection" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No group collections yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Add Member Dialog */}
      <ConfirmDialog
        open={addMemberOpen}
        onOpenChange={(open) => {
          setAddMemberOpen(open);
          if (!open) {
            setSelectedCustomer(null);
            setMemberSearch('');
            setAddMemberError(null);
          }
        }}
        title="Add Member"
        description="Search and select a customer to add to this group."
        confirmLabel="Add Member"
        loading={addMember.isPending}
        onConfirm={handleAddMember}
      >
        <div className="space-y-2 py-2">
          {addMemberError && <p className="text-sm text-destructive">{addMemberError}</p>}
          <Label>Customer</Label>
          <div className="relative" ref={memberDropdownRef}>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={memberSearch}
                onChange={(e) => {
                  setMemberSearch(e.target.value);
                  setShowMemberDropdown(true);
                  if (!e.target.value) clearSelectedCustomer();
                }}
                onFocus={() => setShowMemberDropdown(true)}
                placeholder="Search customer by name or mobile..."
                className="pl-9 pr-9"
                autoComplete="off"
                disabled={addMember.isPending}
              />
              {selectedCustomer && (
                <button
                  type="button"
                  onClick={clearSelectedCustomer}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            {showMemberDropdown && customerResults?.data && customerResults.data.length > 0 && (
              <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                {customerResults.data.map((c) => (
                  <li
                    key={c.id}
                    onClick={() => selectCustomerForMember(c)}
                    className="cursor-pointer px-3 py-2 hover:bg-accent"
                  >
                    <span className="font-medium">{c.full_name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{c.mobile}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ConfirmDialog>

      {/* Group Collection Dialog */}
      <ConfirmDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        title="Post Group Collection"
        description="Enter payment amounts for each member (in ₹)."
        confirmLabel="Post Collection"
        loading={postGroupCollection.isPending}
        onConfirm={handlePostGroupCollection}
      >
        <div className="space-y-3 py-2 max-h-80 overflow-y-auto">
          {collectError && <p className="text-sm text-destructive">{collectError}</p>}
          {group.members.map((m: GroupMember) => (
            <div key={m.customer_id} className="flex items-center gap-3">
              <div className="flex-1 text-sm">
                <p className="font-medium">{m.customer_name}</p>
                {m.outstanding_paise != null && (
                  <p className="text-muted-foreground">
                    Outstanding: <MoneyDisplay paise={Number(m.outstanding_paise)} />
                  </p>
                )}
              </div>
              <Input
                className="w-28"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="₹ 0"
                value={payments[m.customer_id] ?? ''}
                onChange={(e) => setPayments((prev) => ({ ...prev, [m.customer_id]: e.target.value }))}
                disabled={postGroupCollection.isPending}
              />
            </div>
          ))}
        </div>
      </ConfirmDialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="capitalize">{value ?? '—'}</span>
    </div>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useLoanProducts, useDeactivateLoanProduct, type LoanProduct } from '@/hooks/useLoanProducts';
import { useToast } from '@/providers/toast-provider';
import {
  StatusBadge,
  MoneyDisplay,
  LoadingSpinner,
  ErrorMessage,
  PaginationControls,
  PermissionGate,
  ConfirmDialog,
} from '@/components/shared';
import { Button } from '@/components/ui/button';
import { calculatePeriodicRate } from '@/lib/utils';

export default function LoanProductsPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useLoanProducts({ page });
  const deactivate = useDeactivateLoanProduct();
  const { showToast } = useToast();

  const [deactivateProduct, setDeactivateProduct] = useState<LoanProduct | null>(null);

  async function handleDeactivate() {
    if (!deactivateProduct) return;
    try {
      await deactivate.mutateAsync(deactivateProduct.id);
      showToast({ message: 'Product deactivated.' });
      setDeactivateProduct(null);
    } catch (err) {
      showToast({ message: (err as Error).message || 'Failed to deactivate.', variant: 'error' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold">Loan Products</h1>
        <PermissionGate permission="loan_product.create">
          <Button asChild>
            <Link href="/loan-products/new">
              <Plus className="mr-2 h-4 w-4" />New Product
            </Link>
          </Button>
        </PermissionGate>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner size="lg" />
        </div>
      )}

      {error && <ErrorMessage message={(error as Error).message} />}

      {data && (
        <>
          {/* Mobile Card View */}
          <div className="space-y-3 lg:hidden">
            {data.data.map((p) => {
              const v = p.current_version;
              const annualRate = (v?.annual_rate_bps ?? 0) / 100;
              return (
                <div key={p.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      {/* No detail page exists; link to edit when permitted, plain text otherwise. */}
                      <PermissionGate
                        permission="loan_product.update"
                        fallback={<span className="font-medium">{p.name}</span>}
                      >
                        <Link
                          href={`/loan-products/${p.id}/edit`}
                          className="font-medium text-primary hover:underline"
                        >
                          {p.name}
                        </Link>
                      </PermissionGate>
                      <span className="ml-1 text-xs text-muted-foreground">v{v?.version_number ?? 1}</span>
                      <p className="text-sm text-muted-foreground mt-1">
                        {v?.interest_type?.replace(/_/g, ' ') ?? '-'} @ {annualRate.toFixed(2)}% p.a.
                        {(() => {
                          const periodic = calculatePeriodicRate(annualRate, v?.repayment_frequency);
                          return <span className="ml-1">({periodic.formatted}% {periodic.label})</span>;
                        })()}
                      </p>
                    </div>
                    <StatusBadge status={p.is_active ? 'active' : 'inactive'} type="product" />
                  </div>
                  <div className="mt-3 text-sm text-muted-foreground">
                    <span className="capitalize">{v?.repayment_frequency ?? '-'}</span>
                    <span className="mx-2">•</span>
                    <MoneyDisplay paise={v?.min_principal_paise ?? 0} /> – <MoneyDisplay paise={v?.max_principal_paise ?? 0} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <PermissionGate permission="loan_product.update">
                      <Button variant="outline" size="sm" className="min-h-[40px] flex-1" asChild>
                        <Link href={`/loan-products/${p.id}/edit`}>Edit</Link>
                      </Button>
                    </PermissionGate>
                    {p.is_active && (
                      <PermissionGate permission="loan_product.deactivate">
                        <Button
                          variant="outline"
                          size="sm"
                          className="min-h-[40px] flex-1"
                          onClick={() => setDeactivateProduct(p)}
                          disabled={deactivate.isPending}
                        >
                          Deactivate
                        </Button>
                      </PermissionGate>
                    )}
                  </div>
                </div>
              );
            })}
            {data.data.length === 0 && (
              <div className="py-8 text-center text-muted-foreground">
                No loan products found.
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium">Interest Type</th>
                  <th className="px-4 py-3 text-right font-medium">Rate (% p.a.)</th>
                  <th className="px-4 py-3 text-right font-medium">Periodic Rate</th>
                  <th className="px-4 py-3 text-left font-medium">Frequency</th>
                  <th className="px-4 py-3 text-right font-medium">Principal Range</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => {
                  const v = p.current_version;
                  const annualRate = (v?.annual_rate_bps ?? 0) / 100;
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        {/* No detail page exists; link to edit when permitted, plain text otherwise. */}
                        <PermissionGate
                          permission="loan_product.update"
                          fallback={<span className="font-medium">{p.name}</span>}
                        >
                          <Link
                            href={`/loan-products/${p.id}/edit`}
                            className="font-medium text-primary hover:underline"
                          >
                            {p.name}
                          </Link>
                        </PermissionGate>
                        <span className="ml-1 text-xs text-muted-foreground">v{v?.version_number ?? 1}</span>
                      </td>
                      <td className="px-4 py-3 capitalize">
                        {v?.interest_type?.replace(/_/g, ' ') ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right">{annualRate.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">
                        {(() => {
                          const periodic = calculatePeriodicRate(annualRate, v?.repayment_frequency);
                          return `${periodic.formatted}% ${periodic.label}`;
                        })()}
                      </td>
                      <td className="px-4 py-3 capitalize">{v?.repayment_frequency ?? '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <MoneyDisplay paise={v?.min_principal_paise ?? 0} /> – <MoneyDisplay paise={v?.max_principal_paise ?? 0} />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={p.is_active ? 'active' : 'inactive'} type="product" />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <PermissionGate permission="loan_product.update">
                            <Button variant="outline" size="sm" asChild>
                              <Link href={`/loan-products/${p.id}/edit`}>Edit</Link>
                            </Button>
                          </PermissionGate>
                          {p.is_active && (
                            <PermissionGate permission="loan_product.deactivate">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setDeactivateProduct(p)}
                                disabled={deactivate.isPending}
                              >
                                Deactivate
                              </Button>
                            </PermissionGate>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">
                      No loan products found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <PaginationControls
            page={page}
            totalPages={Math.ceil((data.total || 0) / 20)}
            onPageChange={setPage}
          />
        </>
      )}

      {/* Deactivate Confirmation */}
      <ConfirmDialog
        open={!!deactivateProduct}
        onOpenChange={(open) => { if (!open) setDeactivateProduct(null); }}
        title="Deactivate Product"
        description={`Are you sure you want to deactivate "${deactivateProduct?.name}"? New loans cannot use this product.`}
        confirmLabel="Deactivate"
        variant="destructive"
        loading={deactivate.isPending}
        onConfirm={handleDeactivate}
      />
    </div>
  );
}

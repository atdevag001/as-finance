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
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium">Name</th>
                  <th className="px-4 py-3 text-left font-medium hidden sm:table-cell">Interest Type</th>
                  <th className="px-4 py-3 text-right font-medium">Rate (%)</th>
                  <th className="px-4 py-3 text-left font-medium hidden md:table-cell">Frequency</th>
                  <th className="px-4 py-3 text-right font-medium hidden lg:table-cell">Principal Range</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link
                        href={`/loan-products/${p.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {p.name}
                      </Link>
                      <span className="ml-1 text-xs text-muted-foreground">v{p.version}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell capitalize">
                      {p.interest_type.replace(/_/g, ' ')}
                    </td>
                    <td className="px-4 py-3 text-right">{(p.annual_rate / 100).toFixed(2)}</td>
                    <td className="px-4 py-3 hidden md:table-cell capitalize">{p.frequency}</td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell">
                      <MoneyDisplay paise={p.min_principal_paise} /> – <MoneyDisplay paise={p.max_principal_paise} />
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
                ))}
                {data.data.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
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

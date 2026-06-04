'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, totalPages, onPageChange }: PaginationControlsProps) {
  // Hide entirely for invalid totals (0 or negative); also hide the navigation
  // controls when there's only a single page, but still show the page indicator.
  if (totalPages < 1) return null;
  const showNav = totalPages > 1;

  return (
    <div className="flex items-center justify-between gap-4 pt-4">
      <p className="text-sm text-muted-foreground">
        Page {page} of {totalPages}
      </p>
      {showNav && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px]"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px] min-w-[44px] md:min-h-[36px] md:min-w-[36px]"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            <ChevronRight className="h-5 w-5 md:h-4 md:w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

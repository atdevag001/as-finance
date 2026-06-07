'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Search, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useCreateGroup } from '@/hooks/useGroups';
import { useCustomers, type Customer } from '@/hooks/useCustomers';
import { useToast } from '@/providers/toast-provider';
import { useAuth } from '@/providers/auth-provider';
import { ApiClientError } from '@/lib/api-client';
import { hasPermission } from '@/lib/permissions';
import { AccessDenied, ErrorMessage, LoadingSpinner } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const DAYS_OF_WEEK = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

const formSchema = z.object({
  name: z.string().min(1, 'Group name is required').max(200),
  meetingDay: z.enum(DAYS_OF_WEEK, { required_error: 'Meeting day is required' }),
  branchArea: z.string().min(1, 'Branch/Area is required').max(200),
  leaderId: z.string().min(1, 'Group leader is required'),
});

type FormData = z.infer<typeof formSchema>;

export default function NewGroupPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const role = user?.role ?? '';

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(role, 'group.create')) {
    return <AccessDenied />;
  }

  return <NewGroupPageContent />;
}

function NewGroupPageContent() {
  const router = useRouter();
  const createGroup = useCreateGroup();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  // Leader search state
  const [leaderSearch, setLeaderSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedLeader, setSelectedLeader] = useState<Customer | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounce leader search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(leaderSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [leaderSearch]);

  const { data: customerResults } = useCustomers({
    search: debouncedSearch || undefined,
    page: 1,
  });

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      meetingDay: undefined,
      branchArea: '',
      leaderId: '',
    },
  });

  const selectLeader = (customer: Customer) => {
    setSelectedLeader(customer);
    setValue('leaderId', customer.id);
    setLeaderSearch(customer.full_name);
    setShowDropdown(false);
  };

  const clearLeader = () => {
    setSelectedLeader(null);
    setValue('leaderId', '');
    setLeaderSearch('');
  };

  const onSubmit = async (data: FormData) => {
    setServerError(null);
    try {
      await createGroup.mutateAsync(data);
      showToast({ message: 'Group created successfully' });
      router.push('/groups');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to create group');
      } else {
        setServerError((err as Error).message || 'An unexpected error occurred');
      }
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]" asChild>
          <Link href="/groups">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">New Group</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Group Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {/* Group Name */}
            <div className="sm:col-span-2">
              <Field label="Group Name *" error={errors.name?.message}>
                <Input {...register('name')} placeholder="e.g. Village Women SHG" />
              </Field>
            </div>

            {/* Leader Selection */}
            <div className="sm:col-span-2">
              <Field label="Group Leader *" error={errors.leaderId?.message}>
                <div className="relative" ref={dropdownRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={leaderSearch}
                      onChange={(e) => {
                        setLeaderSearch(e.target.value);
                        setShowDropdown(true);
                        if (!e.target.value) clearLeader();
                      }}
                      onFocus={() => setShowDropdown(true)}
                      placeholder="Search customer by name or mobile..."
                      className="pl-9 pr-9"
                      autoComplete="off"
                    />
                    {selectedLeader && (
                      <button
                        type="button"
                        onClick={clearLeader}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {showDropdown && customerResults?.data && customerResults.data.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover shadow-lg">
                      {customerResults.data.map((c) => (
                        <li
                          key={c.id}
                          onClick={() => selectLeader(c)}
                          className="cursor-pointer px-3 py-2 hover:bg-accent"
                        >
                          <span className="font-medium">{c.full_name}</span>
                          <span className="ml-2 text-sm text-muted-foreground">{c.mobile}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </Field>
            </div>

            {/* Meeting Day */}
            <Field label="Meeting Day *" error={errors.meetingDay?.message}>
              <select
                {...register('meetingDay')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm capitalize"
              >
                <option value="">Select day...</option>
                {DAYS_OF_WEEK.map((day) => (
                  <option key={day} value={day} className="capitalize">
                    {day.charAt(0).toUpperCase() + day.slice(1)}
                  </option>
                ))}
              </select>
            </Field>

            {/* Branch/Area */}
            <Field label="Branch / Area *" error={errors.branchArea?.message}>
              <Input {...register('branchArea')} placeholder="e.g. North District" />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="w-full min-h-[48px] sm:w-auto">
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

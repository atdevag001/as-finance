'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { mobileSchema } from '@as-finance/shared/validation';
import { UserRole } from '@as-finance/shared/enums';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useUser, useUpdateUser } from '@/hooks/useUsers';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import { AccessDenied, LoadingSpinner, ErrorMessage } from '@/components/shared';
import { PermissionGate } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const editUserFormSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(200),
  email: z.string().email('Invalid email address').max(200).optional().or(z.literal('')),
  mobile: mobileSchema,
  role: z.nativeEnum(UserRole, { errorMap: () => ({ message: 'Please select a role' }) }),
  isActive: z.boolean(),
});

type FormData = z.infer<typeof editUserFormSchema>;

const ROLE_OPTIONS = Object.values(UserRole).map((r) => ({
  value: r,
  label: r.replace(/_/g, ' '),
}));

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params['id'] as string;
  const { user: authUser, isLoading: isAuthLoading } = useAuth();
  const authRole = authUser?.role ?? '';
  const { data: userData, isLoading, error: fetchError } = useUser(userId);
  const updateUser = useUpdateUser();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const canChangeRole = hasPermission(authRole, 'user.change_role');

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(editUserFormSchema),
  });

  useEffect(() => {
    if (userData) {
      reset({
        fullName: userData.full_name,
        email: userData.email || '',
        mobile: userData.mobile,
        role: userData.role as UserRole,
        isActive: userData.is_active,
      });
    }
  }, [userData, reset]);

  if (isAuthLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="lg" />
      </div>
    );
  }
  if (!hasPermission(authRole, 'user.update')) {
    return <AccessDenied />;
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (fetchError) {
    return <ErrorMessage message={(fetchError as Error).message || 'Failed to load user.'} />;
  }

  if (!userData) {
    return <ErrorMessage message="User not found." />;
  }

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      const payload: Record<string, unknown> = {
        id: userId,
        fullName: data.fullName,
        // Distinguish "clear email" (null) from "leave unchanged" (omitted);
        // coercing '' to undefined would silently drop the clear intent.
        email: data.email === '' ? null : data.email,
        mobile: data.mobile,
        isActive: data.isActive,
      };
      if (canChangeRole) {
        payload['role'] = data.role;
      }
      await updateUser.mutateAsync(payload as { id: string } & Record<string, unknown>);
      showToast({ message: 'User updated successfully', variant: 'success' });
      router.push('/users');
    } catch (err) {
      if (err instanceof ApiClientError) {
        setServerError(err.body.message || 'Failed to update user. Please try again.');
      } else {
        setServerError('Unable to connect to server. Please check your connection.');
      }
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/users">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-2xl font-bold">Edit User</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input value={userData.username} disabled className="bg-muted" />
            </div>
            <Field label="Full Name *" error={errors.fullName?.message}>
              <Input {...register('fullName')} />
            </Field>
            <Field label="Email" error={errors.email?.message}>
              <Input {...register('email')} type="email" placeholder="optional" />
            </Field>
            <Field label="Mobile *" error={errors.mobile?.message}>
              <Input {...register('mobile')} inputMode="numeric" maxLength={10} />
            </Field>
            {canChangeRole ? (
              <Field label="Role *" error={errors.role?.message}>
                <select
                  {...register('role')}
                  className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:min-h-[40px] md:text-sm"
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Input
                  value={userData.role.replace(/_/g, ' ')}
                  disabled
                  className="bg-muted capitalize"
                />
              </div>
            )}
            <div className="flex items-center gap-3 pt-6">
              <input
                type="checkbox"
                id="isActive"
                {...register('isActive')}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="w-full min-h-[48px] sm:w-auto">
            {isSubmitting ? 'Saving…' : 'Save Changes'}
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { passwordSchema } from '@as-finance/shared/validation';
import { mobileSchema } from '@as-finance/shared/validation';
import { UserRole } from '@as-finance/shared/enums';
import { useAuth } from '@/providers/auth-provider';
import { hasPermission } from '@/lib/permissions';
import { useCreateUser } from '@/hooks/useUsers';
import { useToast } from '@/providers/toast-provider';
import { ApiClientError } from '@/lib/api-client';
import { AccessDenied, ErrorMessage } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const createUserFormSchema = z.object({
  username: z.string().min(3, 'Username must be at least 3 characters').max(50),
  fullName: z.string().min(1, 'Full name is required').max(200),
  mobile: mobileSchema,
  password: passwordSchema,
  role: z.nativeEnum(UserRole, { errorMap: () => ({ message: 'Please select a role' }) }),
  area: z.string().max(200).optional(),
});

type FormData = z.infer<typeof createUserFormSchema>;

const ROLE_OPTIONS = Object.values(UserRole).map((r) => ({
  value: r,
  label: r.replace(/_/g, ' '),
}));

export default function NewUserPage() {
  const router = useRouter();
  const { user } = useAuth();
  const role = user?.role ?? '';
  const createUser = useCreateUser();
  const { showToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(createUserFormSchema),
  });

  if (!hasPermission(role, 'user.create')) {
    return <AccessDenied />;
  }

  async function onSubmit(data: FormData) {
    setServerError(null);
    try {
      await createUser.mutateAsync({
        username: data.username,
        full_name: data.fullName,
        mobile: data.mobile,
        password: data.password,
        role: data.role,
        ...(data.area ? { area: data.area } : {}),
      });
      showToast({ message: 'User created successfully', variant: 'success' });
      router.push('/users');
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 409) {
          setServerError('A user with this username already exists.');
        } else {
          setServerError(err.body.message || 'Failed to create user. Please try again.');
        }
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
        <h1 className="text-2xl font-bold">Create User</h1>
      </div>

      {serverError && <ErrorMessage message={serverError} />}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">User Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <Field label="Username *" error={errors.username?.message}>
              <Input {...register('username')} autoComplete="off" />
            </Field>
            <Field label="Full Name *" error={errors.fullName?.message}>
              <Input {...register('fullName')} />
            </Field>
            <Field label="Mobile *" error={errors.mobile?.message}>
              <Input {...register('mobile')} inputMode="numeric" maxLength={10} />
            </Field>
            <Field label="Password *" error={errors.password?.message}>
              <Input {...register('password')} type="password" autoComplete="new-password" />
            </Field>
            <Field label="Role *" error={errors.role?.message}>
              <select
                {...register('role')}
                className="flex min-h-[44px] w-full rounded-md border border-input bg-background px-3 py-2 text-base md:min-h-[40px] md:text-sm"
              >
                <option value="">Select role…</option>
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Area" error={errors.area?.message}>
              <Input {...register('area')} placeholder="Optional area assignment" />
            </Field>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={isSubmitting} className="w-full min-h-[48px] sm:w-auto">
            {isSubmitting ? 'Creating…' : 'Create User'}
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

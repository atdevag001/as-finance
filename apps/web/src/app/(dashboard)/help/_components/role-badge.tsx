import type { UserRole } from '@as-finance/shared';
import { cn } from '@/lib/utils';

/** Plain-English label for a role, matching the sidebar's "{role.replace(/_/g, ' ')}" formatting. */
const ROLE_LABEL: Record<string, { en: string; hi: string; hinglish: string }> = {
  SUPER_ADMIN: { en: 'Super Admin', hi: 'सुपर एडमिन', hinglish: 'Super Admin' },
  MANAGER: { en: 'Branch Manager', hi: 'ब्रांच मैनेजर', hinglish: 'Branch Manager' },
  FIELD_OFFICER: { en: 'Field Officer', hi: 'फील्ड ऑफिसर', hinglish: 'Field Officer' },
  COLLECTION_OFFICER: {
    en: 'Collection Officer',
    hi: 'कलेक्शन ऑफिसर',
    hinglish: 'Collection Officer',
  },
  ACCOUNTANT: { en: 'Accountant', hi: 'अकाउंटेंट', hinglish: 'Accountant' },
  OFFICE_STAFF: { en: 'Office Staff', hi: 'ऑफिस स्टाफ', hinglish: 'Office Staff' },
  VIEWER_AUDITOR: { en: 'Auditor', hi: 'ऑडिटर', hinglish: 'Auditor' },
};

export function RoleBadge({
  role,
  lang,
  className,
}: {
  role: UserRole | string;
  lang: 'en' | 'hi' | 'hinglish';
  className?: string;
}) {
  const label = ROLE_LABEL[role as string]?.[lang] ?? String(role).replace(/_/g, ' ');
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-secondary-foreground',
        className,
      )}
    >
      {label}
    </span>
  );
}

export function RoleBadgeRow({
  roles,
  lang,
  labelText,
}: {
  roles: (UserRole | string)[];
  lang: 'en' | 'hi' | 'hinglish';
  labelText: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-muted-foreground">{labelText}</span>
      {roles.map((role) => (
        <RoleBadge key={String(role)} role={role} lang={lang} />
      ))}
    </div>
  );
}

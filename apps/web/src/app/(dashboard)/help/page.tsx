'use client';

import Link from 'next/link';
import {
  BookOpen,
  UserCircle,
  Users,
  FileText,
  Package,
  Banknote,
  Receipt,
  UsersRound,
  Wallet,
  BookText,
  AlertOctagon,
  BarChart3,
  UserCog,
  Settings as SettingsIcon,
  Bell,
  Shield,
  LifeBuoy,
  GraduationCap,
  Route,
  FileSpreadsheet,
  Phone,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/providers/auth-provider';
import { CHAPTERS } from './_content/chapters';
import { useHelpLang } from './_components/help-language-context';
import { LanguageSwitcher } from './_components/language-switcher';
import type { HelpLang } from './_content/_types';

const ICONS: Record<string, LucideIcon> = {
  BookOpen,
  UserCircle,
  Users,
  FileText,
  Package,
  Banknote,
  Receipt,
  UsersRound,
  Wallet,
  BookText,
  AlertOctagon,
  BarChart3,
  UserCog,
  Settings: SettingsIcon,
  Bell,
  Shield,
  LifeBuoy,
  GraduationCap,
  Route,
  FileSpreadsheet,
};

const PAGE: Record<HelpLang, {
  greeting: (name: string) => string;
  intro: string;
  firstTimeTitle: string;
  firstTimeBody: string;
  firstTimeCta: string;
  chaptersHeading: string;
  supportTitle: string;
  supportBody: string;
  supportPhoneLabel: string;
  supportHoursLabel: string;
  supportLangsLabel: string;
}> = {
  en: {
    greeting: (name) => `Hi ${name} — how can we help?`,
    intro:
      'This is the AS-Finance user guide. Pick a topic below, or use the floating ? button on any screen to jump straight to the right page.',
    firstTimeTitle: 'First day at AS-Finance?',
    firstTimeBody:
      "Start here. A 5-minute path through what you'll touch every day — login, dashboard, your role, and your first task.",
    firstTimeCta: 'Start the 5-minute tour →',
    chaptersHeading: 'All chapters',
    supportTitle: 'Stuck? Talk to a human.',
    supportBody:
      "If the guide doesn't have the answer, your branch manager is the first stop. Call the support number below for anything urgent.",
    supportPhoneLabel: 'Support phone',
    supportHoursLabel: 'Hours',
    supportLangsLabel: 'Languages',
  },
  hi: {
    greeting: (name) => `नमस्ते ${name} — हम क्या मदद कर सकते हैं?`,
    intro:
      'यह AS-Finance का यूज़र गाइड है। नीचे से कोई विषय चुनें, या ऐप की किसी भी स्क्रीन पर ? बटन दबाकर सीधे सही पेज पर जाएँ।',
    firstTimeTitle: 'AS-Finance पर पहला दिन?',
    firstTimeBody:
      'यहाँ से शुरू करें। 5 मिनट में हर रोज़ की चीज़ें — लॉगिन, डैशबोर्ड, आपका रोल और आपका पहला काम।',
    firstTimeCta: '5 मिनट का टूर शुरू करें →',
    chaptersHeading: 'सभी अध्याय',
    supportTitle: 'अटक गए? किसी से बात करें।',
    supportBody:
      'अगर गाइड में जवाब नहीं मिल रहा, तो पहले अपने ब्रांच मैनेजर से पूछें। ज़रूरी मामले के लिए नीचे दिए नंबर पर कॉल करें।',
    supportPhoneLabel: 'सपोर्ट फ़ोन',
    supportHoursLabel: 'समय',
    supportLangsLabel: 'भाषाएँ',
  },
  hinglish: {
    greeting: (name) => `Hi ${name} — kya help chahiye?`,
    intro:
      'Ye AS-Finance ka user guide hai. Niche se topic chunein, ya app ki kisi bhi screen par ? button dabakar seedha sahi page par jaayein.',
    firstTimeTitle: 'AS-Finance par pehla din?',
    firstTimeBody:
      'Yahin se shuru karein. 5 minute mein wo sab jo daily chahiye — login, dashboard, aapka role, aur pehla kaam.',
    firstTimeCta: '5-minute tour shuru karein →',
    chaptersHeading: 'Saare chapters',
    supportTitle: 'Atak gaye? Kisi se baat karein.',
    supportBody:
      'Agar guide mein jawab nahi mila, pehle branch manager se pooch lo. Urgent ke liye neeche diye number par call karein.',
    supportPhoneLabel: 'Support phone',
    supportHoursLabel: 'Hours',
    supportLangsLabel: 'Languages',
  },
};

const SUPPORT = {
  phone:
    typeof process !== 'undefined' && process.env['NEXT_PUBLIC_SUPPORT_PHONE']
      ? process.env['NEXT_PUBLIC_SUPPORT_PHONE']
      : '+91-80-0000-0000',
  hours: 'Mon–Sat, 9:00–18:00 IST',
  languages: 'English, हिंदी',
};

export default function HelpHomePage() {
  const { user } = useAuth();
  const { lang } = useHelpLang();
  const t = PAGE[lang];
  const displayName = user?.fullName?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t.greeting(displayName)}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">{t.intro}</p>
        </div>
        <LanguageSwitcher />
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <Sparkles className="mt-0.5 h-6 w-6 text-primary" aria-hidden="true" />
          <div>
            <CardTitle className="text-lg">{t.firstTimeTitle}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{t.firstTimeBody}</p>
          </div>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={`/help/getting-started?lang=${lang}#first-time`}>{t.firstTimeCta}</Link>
          </Button>
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-4 text-xl font-semibold">{t.chaptersHeading}</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CHAPTERS.map((c) => {
            const Icon = c.iconName ? ICONS[c.iconName] ?? BookOpen : BookOpen;
            return (
              <Link
                key={c.id}
                href={`/help/${c.id}?lang=${lang}`}
                className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary hover:bg-accent"
              >
                <div className="flex items-start gap-3">
                  <Icon className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-semibold group-hover:text-primary">{c.label[lang]}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{c.hook[lang]}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <Card>
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <Phone className="mt-0.5 h-6 w-6 text-emerald-600" aria-hidden="true" />
          <div>
            <CardTitle className="text-lg">{t.supportTitle}</CardTitle>
            <p className="mt-2 text-sm text-muted-foreground">{t.supportBody}</p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted-foreground">{t.supportPhoneLabel}</dt>
              <dd className="font-medium">
                <a className="hover:underline" href={`tel:${SUPPORT.phone.replace(/[^0-9+]/g, '')}`}>
                  {SUPPORT.phone}
                </a>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t.supportHoursLabel}</dt>
              <dd className="font-medium">{SUPPORT.hours}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t.supportLangsLabel}</dt>
              <dd className="font-medium">{SUPPORT.languages}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

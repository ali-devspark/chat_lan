import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/routing';
import { buttonVariants } from '@/components/ui/button';
import { MessageSquare, Zap, Globe, Shield } from 'lucide-react';

export default function Home() {
  const t = useTranslations('HomePage');

  return (
    <div className="flex-1 flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-4 py-20 bg-mesh relative overflow-hidden">
        {/* Decorative blurred orbs */}
        <div className="absolute top-1/4 -inset-s-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 -inset-e-24 w-80 h-80 rounded-full bg-purple-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 max-w-3xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20">
            <Zap className="w-3.5 h-3.5" />
            <span>{t('badge')}</span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight mb-6 bg-linear-to-br from-foreground via-foreground to-primary bg-clip-text text-transparent leading-tight">
            {t('title')}
          </h1>

          <p className="text-lg text-muted-foreground mb-10 max-w-xl mx-auto leading-relaxed">
            {t('description')}
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <Link
              href="/chat"
              className={`${buttonVariants({ variant: 'default', size: 'lg' })} bg-gradient-brand border-0 shadow-lg shadow-primary/30 hover:shadow-primary/50 hover:opacity-90 transition-all`}
            >
              <MessageSquare className="w-4 h-4 me-2 rtl:scale-x-[-1]" />
              {t('ctaStart')}
            </Link>
            <Link
              href="/login"
              className={`${buttonVariants({ variant: 'outline', size: 'lg' })}`}
            >
              {t('ctaLogin')}
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-4 bg-muted/30 border-t">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">{t('featuresTitle')}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {[
              {
                icon: <MessageSquare className="w-7 h-7" />,
                title: t('feature1Title'),
                desc: t('feature1Desc'),
              },
              {
                icon: <Globe className="w-7 h-7" />,
                title: t('feature2Title'),
                desc: t('feature2Desc'),
              },
              {
                icon: <Shield className="w-7 h-7" />,
                title: t('feature3Title'),
                desc: t('feature3Desc'),
              },
            ].map((f, i) => (
              <div
                key={i}
                className="group flex flex-col items-center text-center p-8 rounded-2xl bg-card border hover-lift"
              >
                <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-5 group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  {f.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

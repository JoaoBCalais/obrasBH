import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { ReactNode } from 'react'
import styles from '@/styles/Layout.module.css'

interface LayoutProps {
  children: ReactNode
  title?: string
  description?: string
  alertasCriticos?: number
  hero?: ReactNode
}

const NAV_LINKS = [
  { href: '/', label: 'Início' },
  { href: '/radar', label: 'Radar' },
]

export function Layout({ children, title, description, alertasCriticos = 0, hero }: LayoutProps) {
  const router = useRouter()

  return (
    <>
      <Head>
        <title>{title || 'ObrasBH — Transparência em Obras Públicas'}</title>
        {description && <meta name="description" content={description} />}
      </Head>

      <div className={styles.app}>
        <header className={styles.navbar}>
          <div className={styles.navInner}>
            <Link href="/" className={styles.logo}>
              <span className={styles.logoMark} aria-hidden="true">▦</span>
              Obras<strong>BH</strong>
            </Link>

            <nav className={styles.nav} aria-label="Navegação principal">
              {NAV_LINKS.map(link => {
                const ativo = link.href === '/'
                  ? router.pathname === '/'
                  : router.pathname.startsWith(link.href)
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`${styles.navLink} ${ativo ? styles.navLinkAtivo : ''}`}
                    aria-current={ativo ? 'page' : undefined}
                  >
                    {link.label}
                    {link.href === '/radar' && alertasCriticos > 0 && (
                      <span className={styles.navBadge} title={`${alertasCriticos} obras críticas`}>
                        {alertasCriticos}
                      </span>
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          {hero && <div className={styles.hero}>{hero}</div>}
        </header>

        <main className={styles.main}>{children}</main>

        <footer className={styles.footer}>
          <div className={styles.footerInner}>
            <p className={styles.footerTitulo}>
              <strong>ObrasBH</strong> — transparência para uma cidade melhor
            </p>
            <p className={styles.footerTexto}>
              Dados abertos do painel Transparência Obras Públicas da SMOBI / Prefeitura de Belo Horizonte.
              Os alertas são indícios calculados automaticamente — não são acusações — e servem como ponto de partida para a fiscalização cidadã.
            </p>
            <nav className={styles.footerNav} aria-label="Links do rodapé">
              <Link href="/">Início</Link>
              <Link href="/radar">Radar de fiscalização</Link>
            </nav>
          </div>
        </footer>
      </div>
    </>
  )
}

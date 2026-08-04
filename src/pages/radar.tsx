import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { Layout } from '@/components/Layout'

/**
 * Rota antiga /radar — mantida para não quebrar links já compartilhados.
 * Redireciona para /criticas.
 */
export default function RadarRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/criticas')
  }, [router])

  return (
    <Layout title="Obras críticas — ObrasBH">
      <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>
        Esta página agora se chama <Link href="/criticas">Obras críticas</Link>. Redirecionando...
      </div>
    </Layout>
  )
}

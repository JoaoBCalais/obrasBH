import type { NextApiRequest, NextApiResponse } from 'next'

/**
 * API Route: POST /api/sync-all
 *
 * Master endpoint que executa TODOS os syncs em sequência:
 *   1. /api/sync          → obras (contratos)
 *   2. /api/sync-localizacao → coordenadas GPS (atualiza obras)
 *   3. /api/sync-renovacoes  → renovações/aditivos
 *   4. /api/sync-medicoes    → medições
 *   5. /api/sync-execucao    → execução financeira
 *
 * A ordem importa: obras deve rodar primeiro (tabela principal),
 * depois localização (atualiza obras), depois as tabelas dependentes.
 *
 * Fonte: Painel Transparência Obras Públicas SMOBI/PBH
 * Atualização da PBH: semanal (última atualização: 23/07/2026)
 */

interface SyncResult {
  endpoint: string
  tabela: string
  success: boolean
  message?: string
  error?: string
  stats?: Record<string, any>
  duration?: number
}

async function runSync(
  baseUrl: string,
  endpoint: string,
  tabela: string,
  syncKey?: string
): Promise<SyncResult> {
  const startTime = Date.now()

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    if (syncKey) {
      headers['x-sync-key'] = syncKey
    }

    const response = await fetch(`${baseUrl}/api/${endpoint}`, {
      method: 'POST',
      headers,
    })

    const data = await response.json()
    const duration = Date.now() - startTime

    return {
      endpoint,
      tabela,
      success: data.success === true,
      message: data.message,
      error: data.error,
      stats: data.stats,
      duration,
    }
  } catch (err: any) {
    return {
      endpoint,
      tabela,
      success: false,
      error: err.message || 'Erro desconhecido',
      duration: Date.now() - startTime,
    }
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const syncKey = process.env.SYNC_API_KEY
  if (syncKey && req.headers['x-sync-key'] !== syncKey) {
    return res.status(401).json({ error: 'Chave inválida' })
  }

  // Detectar a URL base do próprio servidor
  const protocol = req.headers['x-forwarded-proto'] || 'http'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000'
  const baseUrl = `${protocol}://${host}`

  const startTime = Date.now()
  const results: SyncResult[] = []

  // Definir a sequência de syncs
  const syncs = [
    { endpoint: 'sync', tabela: 'obras' },
    { endpoint: 'sync-localizacao', tabela: 'obras (localização)' },
    { endpoint: 'sync-renovacoes', tabela: 'renovacoes' },
    { endpoint: 'sync-medicoes', tabela: 'medicoes' },
    { endpoint: 'sync-execucao', tabela: 'execucao_financeira' },
  ]

  // Executar em sequência (não paralelo, para respeitar FK constraints)
  for (const sync of syncs) {
    const result = await runSync(baseUrl, sync.endpoint, sync.tabela, syncKey)
    results.push(result)

    // Se obras falhou completamente (sem nenhum registro), não adianta continuar
    if (sync.endpoint === 'sync' && !result.success && (!result.stats || result.stats.inseridosAtualizados === 0)) {
      return res.status(500).json({
        success: false,
        message: 'Sync de obras falhou completamente — abortando os demais',
        results,
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      })
    }
  }

  const totalDuration = Date.now() - startTime
  const allSuccess = results.every(r => r.success)
  const successCount = results.filter(r => r.success).length
  const failCount = results.filter(r => !r.success).length

  return res.status(allSuccess ? 200 : 207).json({
    success: allSuccess,
    message: allSuccess
      ? `Sync completo! ${successCount} tabelas atualizadas em ${(totalDuration / 1000).toFixed(1)}s`
      : `${successCount} tabelas ok, ${failCount} com erro (${(totalDuration / 1000).toFixed(1)}s)`,
    results,
    totalDuration,
    timestamp: new Date().toISOString(),
  })
}

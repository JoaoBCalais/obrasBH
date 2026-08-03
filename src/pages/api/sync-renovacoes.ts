import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

/**
 * API Route: POST /api/sync-renovacoes
 *
 * Baixa o CSV RENOVAÇÃO.csv do Google Drive da PBH,
 * parseia e faz upsert na tabela "renovacoes" do Supabase.
 *
 * Colunas do CSV:
 *   Num Cnt, Data Renovação, Ordem Renovação,
 *   Vl Total Última Renovação, Vl Total Aditivo Última Renovação,
 *   Total Contrato, Valor Total Medicao
 *
 * NOTA: O CSV não tem "Empreendimento" — usa "Num Cnt" (contrato).
 *       Fazemos lookup em "obras" para encontrar o id_area_empreendimento.
 *
 * Fonte: Painel Transparência Obras Públicas SMOBI/PBH → DADOS ABERTOS → Renovação
 */

const CSV_URL =
  'https://drive.google.com/uc?export=download&id=1tskglskIa543nRm-OdDLY5ATTlIXDhln&confirm=t'

// --- Helpers ---
function parseNumber(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  const cleaned = val.replace(/[^\d.,\-]/g, '')
  if (cleaned.includes(',') && !cleaned.includes('.')) {
    return parseFloat(cleaned.replace(',', '.')) || 0
  }
  if (cleaned.includes(',') && cleaned.includes('.')) {
    return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0
  }
  return parseFloat(cleaned) || 0
}

function parseDate(val: string | undefined): string | null {
  if (!val || val.trim() === '' || val.trim() === '0') return null
  const trimmed = val.trim().split(' ')[0]
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/')
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`
      }
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed
  return null
}

function parseInt2(val: string | undefined): number {
  if (!val || val.trim() === '') return 0
  return parseInt(val.replace(/[^\d\-]/g, ''), 10) || 0
}

function findCol(row: Record<string, string>, prefix: string): string {
  const key = Object.keys(row).find(k => k.startsWith(prefix))
  return key ? (row[key] || '') : ''
}

interface CsvRow {
  [key: string]: string
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Use POST' })
  }

  const syncKey = process.env.SYNC_API_KEY
  if (syncKey && req.headers['x-sync-key'] !== syncKey) {
    return res.status(401).json({ error: 'Chave inválida' })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Variáveis SUPABASE não configuradas' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
    // 0. Buscar mapa num_cnt → id_area_empreendimento das obras existentes
    const { data: obrasData, error: obrasError } = await supabase
      .from('obras')
      .select('id_area_empreendimento, num_cnt')

    if (obrasError) throw new Error(`Erro ao buscar obras: ${obrasError.message}`)

    // Mapa: num_cnt → id_area_empreendimento (pegar o primeiro match)
    const cntToEmpreendimento = new Map<string, string>()
    for (const obra of (obrasData || [])) {
      if (obra.num_cnt && !cntToEmpreendimento.has(obra.num_cnt)) {
        cntToEmpreendimento.set(obra.num_cnt, obra.id_area_empreendimento)
      }
    }

    // 1. Baixar CSV
    const csvResponse = await fetch(CSV_URL, { redirect: 'follow' })
    if (!csvResponse.ok) {
      throw new Error(`Erro ao baixar CSV: ${csvResponse.status}`)
    }

    const buffer = await csvResponse.arrayBuffer()
    const csvText = new TextDecoder('latin1').decode(buffer)

    if (csvText.trim().startsWith('<!') || csvText.trim().startsWith('<html')) {
      throw new Error('Google Drive retornou página HTML em vez do CSV.')
    }

    // 2. Parsear CSV
    const firstLine = csvText.split('\n')[0] || ''
    const delimiter = firstLine.includes(';') ? ';' : ','

    const { data } = Papa.parse<CsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter,
    })

    if (data.length === 0) {
      throw new Error('CSV vazio ou formato inesperado')
    }

    // 3. Converter (deduplicar por empreendimento+numero_renovacao)
    let semMatch = 0
    const renovacoesMap = new Map<string, Record<string, any>>()

    for (const row of data) {
      const numCnt = row['Num Cnt'] || findCol(row, 'Num Cnt') || ''
      if (!numCnt) continue

      const empreendimento = cntToEmpreendimento.get(numCnt)
      if (!empreendimento) {
        semMatch++
        continue
      }

      const ordemRenovacao = parseInt2(
        row['Ordem Renovação'] || findCol(row, 'Ordem Renova') || row['Ordem Renovacao'] || ''
      )

      const renovacao = {
        id_area_empreendimento: empreendimento,
        num_cnt: numCnt,
        numero_renovacao: ordemRenovacao,
        data_renovacao: parseDate(
          row['Data Renovação'] || findCol(row, 'Data Renova') || row['Data Renovacao'] || ''
        ),
        valor_renovacao: parseNumber(
          row['Vl Total Última Renovação'] || findCol(row, 'Vl Total') || row['Total Contrato'] || ''
        ),
        valor_aditivo_renovacao: parseNumber(
          row['Vl Total Aditivo Última Renovação'] || findCol(row, 'Vl Total Aditivo') || ''
        ),
      }

      renovacoesMap.set(`${empreendimento}::${ordemRenovacao}`, renovacao)
    }

    const renovacoes = Array.from(renovacoesMap.values())

    // 4. Upsert em lotes
    const BATCH_SIZE = 50
    let inserted = 0
    let errorsCount = 0
    const errorMessages: string[] = []

    for (let i = 0; i < renovacoes.length; i += BATCH_SIZE) {
      const batch = renovacoes.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('renovacoes')
        .upsert(batch, {
          onConflict: 'id_area_empreendimento,numero_renovacao',
          ignoreDuplicates: false,
        })

      if (error) {
        errorsCount++
        errorMessages.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        inserted += batch.length
      }
    }

    return res.status(200).json({
      success: errorsCount === 0 && inserted > 0,
      tabela: 'renovacoes',
      message: errorsCount === 0 && inserted > 0
        ? `${inserted} renovações sincronizadas`
        : `${inserted} inseridas, ${errorsCount} lotes com erro`,
      stats: {
        csvLinhas: data.length,
        obrasConhecidas: cntToEmpreendimento.size,
        semMatchContrato: semMatch,
        registrosValidos: renovacoes.length,
        inseridosAtualizados: inserted,
        erros: errorsCount,
        errorMessages: errorMessages.slice(0, 5),
        colunasCsv: Object.keys(data[0] || {}),
        exemploRegistro: renovacoes[0] || null,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      tabela: 'renovacoes',
      error: err.message || 'Erro desconhecido',
      timestamp: new Date().toISOString(),
    })
  }
}

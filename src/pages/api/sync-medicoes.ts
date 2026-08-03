import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

/**
 * API Route: POST /api/sync-medicoes
 *
 * Baixa o CSV MEDIÇÕES-SGEE.csv do Google Drive da PBH,
 * parseia e faz upsert na tabela "medicoes" do Supabase.
 *
 * Colunas do CSV:
 *   Ano Medicao, Mes Medicao, Ordem Renovação,
 *   Valor Total Medicao E Reajuste, Valor Total Medicao,
 *   Instrumento Juridico Raiz, Data Inicio Periodo,
 *   Data Fim Periodo, Data Glm, Numero Periodo De Medicao,
 *   Regional Empreendimento - Descricao, Ano Empreendimento,
 *   Num Cnt, Aplicacao
 *
 * NOTA: CSV grande (~104K linhas). Usa "Num Cnt" para lookup.
 *
 * Fonte: Painel Transparência Obras Públicas SMOBI/PBH → DADOS ABERTOS → Dados de Medição
 */

const CSV_URL =
  'https://drive.google.com/uc?export=download&id=1CZ5la4rdegtG0cFx0r03EtlOrd6S9vpl&confirm=t'

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
    // 0. Buscar mapa num_cnt → id_area_empreendimento
    const { data: obrasData, error: obrasError } = await supabase
      .from('obras')
      .select('id_area_empreendimento, num_cnt')

    if (obrasError) throw new Error(`Erro ao buscar obras: ${obrasError.message}`)

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

    // 3. Converter (deduplicar por empreendimento+numero_medicao)
    let semMatch = 0
    const medicoesMap = new Map<string, Record<string, any>>()

    for (const row of data) {
      const numCnt = row['Num Cnt'] || findCol(row, 'Num Cnt') || ''
      if (!numCnt) continue

      const empreendimento = cntToEmpreendimento.get(numCnt)
      if (!empreendimento) {
        semMatch++
        continue
      }

      let numeroPeriodo = parseInt2(
        row['Numero Periodo De Medicao'] || findCol(row, 'Numero Periodo') || ''
      )
      // Alguns valores excedem o limite de INTEGER (2147483647) — usar módulo para caber
      if (numeroPeriodo > 2147483647 || numeroPeriodo < -2147483648) {
        numeroPeriodo = numeroPeriodo % 1000000 // Manter últimos 6 dígitos
      }

      // Construir periodo_referencia a partir de Mes/Ano
      const anoMedicao = row['Ano Medicao'] || findCol(row, 'Ano Medic') || ''
      const mesMedicao = row['Mes Medicao'] || findCol(row, 'Mes Medic') || ''
      const periodoRef = mesMedicao && anoMedicao ? `${mesMedicao}/${anoMedicao}` : null

      const medicao = {
        id_area_empreendimento: empreendimento,
        num_cnt: numCnt,
        numero_medicao: numeroPeriodo,
        data_medicao: parseDate(
          row['Data Glm'] || findCol(row, 'Data Glm') ||
          row['Data Fim Periodo'] || findCol(row, 'Data Fim') || ''
        ),
        periodo_referencia: periodoRef,
        valor_medicao: parseNumber(
          row['Valor Total Medicao'] || findCol(row, 'Valor Total Medic') || ''
        ),
        valor_acumulado: parseNumber(
          row['Valor Total Medicao E Reajuste'] || findCol(row, 'Valor Total Medicao E') || ''
        ),
      }

      medicoesMap.set(`${empreendimento}::${numeroPeriodo}`, medicao)
    }

    const medicoes = Array.from(medicoesMap.values())

    // 4. Upsert em lotes
    const BATCH_SIZE = 100 // Lotes maiores pois o CSV é grande
    let inserted = 0
    let errorsCount = 0
    const errorMessages: string[] = []

    for (let i = 0; i < medicoes.length; i += BATCH_SIZE) {
      const batch = medicoes.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('medicoes')
        .upsert(batch, {
          onConflict: 'id_area_empreendimento,numero_medicao',
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
      tabela: 'medicoes',
      message: errorsCount === 0 && inserted > 0
        ? `${inserted} medições sincronizadas`
        : `${inserted} inseridas, ${errorsCount} lotes com erro`,
      stats: {
        csvLinhas: data.length,
        obrasConhecidas: cntToEmpreendimento.size,
        semMatchContrato: semMatch,
        registrosValidos: medicoes.length,
        inseridosAtualizados: inserted,
        erros: errorsCount,
        errorMessages: errorMessages.slice(0, 5),
        colunasCsv: Object.keys(data[0] || {}),
        exemploRegistro: medicoes[0] || null,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      tabela: 'medicoes',
      error: err.message || 'Erro desconhecido',
      timestamp: new Date().toISOString(),
    })
  }
}

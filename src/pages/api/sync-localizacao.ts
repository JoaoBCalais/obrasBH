import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

/**
 * API Route: POST /api/sync-localizacao
 *
 * Baixa o CSV SGEE-GEO.csv do Google Drive da PBH,
 * parseia e ATUALIZA a tabela "obras" com coordenadas GPS.
 *
 * Colunas do CSV:
 *   Cod Empreendimento, Posição X WGS84 (Longitude), Posição Y WGS84 (Latitude),
 *   Nome Bairro, Tipo Logradouro, Nome Logradouro, Número,
 *   Numero Contrato, Regional Empreendimento
 *
 * Fonte: Painel Transparência Obras Públicas SMOBI/PBH → DADOS ABERTOS → Dados de localização
 */

const CSV_URL =
  'https://drive.google.com/uc?export=download&id=15h_c9xhPmtHEJU2IcVRd7PAk4KrhlAOh&confirm=t'

// --- Helpers ---
function parseCoord(val: string | undefined): number | null {
  if (!val || val.trim() === '') return null
  // Coordenadas podem usar vírgula como decimal (pt-BR)
  const cleaned = val.trim().replace(',', '.')
  const num = parseFloat(cleaned)
  return isNaN(num) ? null : num
}

function findCol(row: Record<string, string>, prefix: string): string {
  const key = Object.keys(row).find(k => k.startsWith(prefix))
  return key ? (row[key] || '') : ''
}

interface CsvRow {
  [key: string]: string
}

function csvToLocalizacao(row: CsvRow) {
  // O campo chave é "Cod Empreendimento" (não "Empreendimento")
  const empreendimento = row['Cod Empreendimento'] || findCol(row, 'Cod Empreendiment') || ''
  if (!empreendimento) return null

  // Coordenadas: X = Longitude, Y = Latitude (padrão WGS84)
  const latitude = parseCoord(
    row['Posição Y WGS84 (Latitude)'] || findCol(row, 'Posi') && findCol(row, 'Y WGS') || findCol(row, 'Latitude')
  )
  const longitude = parseCoord(
    row['Posição X WGS84 (Longitude)'] || findCol(row, 'Posi') && findCol(row, 'X WGS') || findCol(row, 'Longitude')
  )

  // Ignorar se não tem coordenadas válidas
  if (latitude === null || longitude === null) return null

  return {
    id_area_empreendimento: empreendimento,
    latitude,
    longitude,
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

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Variáveis SUPABASE não configuradas' })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  try {
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

    // 3. Converter (deduplicar por empreendimento)
    const locMap = new Map<string, NonNullable<ReturnType<typeof csvToLocalizacao>>>()
    for (const row of data) {
      const l = csvToLocalizacao(row)
      if (l) {
        locMap.set(l.id_area_empreendimento, l)
      }
    }
    const localizacoes = Array.from(locMap.values())

    // 3b. Buscar obras existentes com nome (necessário para o upsert respeitar NOT NULL)
    const { data: obrasExistentes, error: obrasError } = await supabase
      .from('obras')
      .select('id_area_empreendimento, nome')

    if (obrasError) throw new Error(`Erro ao buscar obras: ${obrasError.message}`)

    const obrasMap = new Map<string, string>()
    for (const o of (obrasExistentes || [])) {
      obrasMap.set(o.id_area_empreendimento, o.nome)
    }

    // Só atualizar obras que existem, incluindo o campo "nome" para satisfazer NOT NULL
    const localizacoesExistentes = localizacoes
      .filter(l => obrasMap.has(l.id_area_empreendimento))
      .map(l => ({
        ...l,
        nome: obrasMap.get(l.id_area_empreendimento)!, // Incluir nome existente
      }))
    const ignoradas = localizacoes.length - localizacoesExistentes.length

    // 4. Upsert em lotes (agora com nome incluído, satisfaz NOT NULL)
    const BATCH_SIZE = 50
    let updated = 0
    let errorsCount = 0
    const errorMessages: string[] = []

    for (let i = 0; i < localizacoesExistentes.length; i += BATCH_SIZE) {
      const batch = localizacoesExistentes.slice(i, i + BATCH_SIZE)
      const { error } = await supabase
        .from('obras')
        .upsert(batch, {
          onConflict: 'id_area_empreendimento',
          ignoreDuplicates: false,
        })

      if (error) {
        errorsCount++
        errorMessages.push(`Lote ${Math.floor(i / BATCH_SIZE) + 1}: ${error.message}`)
      } else {
        updated += batch.length
      }
    }

    return res.status(200).json({
      success: errorsCount === 0 && updated > 0,
      tabela: 'obras (localização)',
      message: errorsCount === 0 && updated > 0
        ? `${updated} obras atualizadas com coordenadas`
        : `${updated} atualizadas, ${errorsCount} lotes com erro`,
      stats: {
        csvLinhas: data.length,
        registrosValidos: localizacoes.length,
        comObraExistente: localizacoesExistentes.length,
        ignoradasSemObra: ignoradas,
        atualizados: updated,
        erros: errorsCount,
        errorMessages: errorMessages.slice(0, 5),
        colunasCsv: Object.keys(data[0] || {}),
        exemploRegistro: localizacoes[0] || null,
      },
      timestamp: new Date().toISOString(),
    })
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      tabela: 'obras (localização)',
      error: err.message || 'Erro desconhecido',
      timestamp: new Date().toISOString(),
    })
  }
}

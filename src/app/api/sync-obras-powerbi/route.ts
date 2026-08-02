import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import Papa from 'papaparse'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false }
})

interface ObraProcessada {
  id_area_empreendimento: string
  numero_po: string
  nome: string
  regional: string
  status: string
  empresa: string
  tematica: string
  fonte: 'powerbi' | 'ckan'
}

async function downloadPowerBIData(): Promise<string> {
  const url = 'https://drive.google.com/uc?id=11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm&export=download'
  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.text()
}

function processarPowerBIData(csvText: string): Promise<ObraProcessada[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
      complete: (results: any) => {
        console.log(`Linhas parseadas: ${results.data.length}`)

        const obras = results.data
          .filter((row: any) => row['Empreendimento'])
          .map((row: any) => ({
            id_area_empreendimento: row['Empreendimento'] || '',
            numero_po: row['Num Cnt'] || '',
            nome: row['Desc Empreendimento'] || 'Sem nome',
            regional: row['Regional Empreendimento - Descricao'] || 'Não informado',
            status: row['Status Contrato'] || 'Desconhecido',
            empresa: row['Empresa Contratada'] || 'Não informado',
            tematica: row['Objeto Cnt']?.substring(0, 50) || 'Infraestrutura',
            fonte: 'powerbi' as const
          }))

        // Remover duplicatas por id_area_empreendimento
        const seen = new Set<string>()
        const deduped = obras.filter(obra => {
          if (seen.has(obra.id_area_empreendimento)) {
            return false
          }
          seen.add(obra.id_area_empreendimento)
          return true
        })

        console.log(`Obras filtradas: ${deduped.length} (${obras.length - deduped.length} duplicadas removidas)`)
        resolve(deduped)
      },
      error: reject
    })
  })
}

async function salvarNoSupabase(obras: ObraProcessada[]): Promise<number> {
  if (obras.length === 0) return 0

  let totalInserido = 0
  for (let i = 0; i < obras.length; i += 100) {
    const chunk = obras.slice(i, i + 100)
    const { error } = await supabase.from('obras').upsert(chunk, {
      onConflict: 'id_area_empreendimento'
    }).select()
    if (error) throw error
    totalInserido += chunk.length
  }
  return totalInserido
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ erro: 'Não autorizado' }, { status: 401 })
  }

  try {
    const csvText = await downloadPowerBIData()
    const obras = await processarPowerBIData(csvText)
    const total = await salvarNoSupabase(obras)

    return NextResponse.json({
      sucesso: true,
      total,
      mensagem: `${total} obras sincronizadas`
    })
  } catch (error) {
    console.error('Erro:', error)
    return NextResponse.json({ erro: String(error) }, { status: 500 })
  }
}

export const config = { maxDuration: 60 }

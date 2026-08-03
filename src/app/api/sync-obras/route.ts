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
  const googleDriveId = '11B4Y3IYF31QLle1_7dsI5MELOg5uwLTm'
  const url = `https://drive.google.com/uc?id=${googleDriveId}&export=download`

  try {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } catch (error) {
    console.error('Erro ao baixar CSV do PowerBI:', error)
    throw error
  }
}

function processarPowerBIData(csvText: string): Promise<ObraProcessada[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      delimiter: ';',
      complete: (results: any) => {
        const obras = results.data
          .filter((row: any) => row['Empreendimento'] && row['Empreendimento'].trim())
          .map((row: any) => ({
            id_area_empreendimento: row['Empreendimento'] || '',
            numero_po: row['Num Cnt'] || '',
            nome: row['Desc Empreendimento'] || 'Sem nome',
            regional: row['Regional Empreendimento - Descricao'] || 'Não informado',
            status: mapearStatusPowerBI(row['Status Contrato'] || 'Desconhecido'),
            empresa: row['Empresa Contratada'] || 'Não informado',
            tematica: (row['Objeto Cnt'] || 'Infraestrutura').substring(0, 50),
            fonte: 'powerbi' as const
          }))

        resolve(obras)
      },
      error: reject
    })
  })
}

function mapearStatusPowerBI(situacao: string): string {
  const mapa: Record<string, string> = {
    'Em andamento': 'EM_ANDAMENTO',
    'Paralisado': 'PARALISADA',
    'Concluído': 'CONCLUIDA',
    'Rescindido': 'RESCINDIDA',
    'Distratado': 'DISTRATATA',
    'Aguardando': 'AGUARDANDO'
  }
  return mapa[situacao?.trim() || ''] || situacao
}

async function salvarNoSupabase(obras: ObraProcessada[]): Promise<number> {
  if (obras.length === 0) return 0

  let totalInserido = 0
  for (let i = 0; i < obras.length; i += 100) {
    const chunk = obras.slice(i, i + 100)
    const { error } = await supabase
      .from('obras')
      .upsert(chunk, { onConflict: 'id_area_empreendimento' })
      .select()

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
    const obrasProcessadas = await processarPowerBIData(csvText)
    const totalInserido = await salvarNoSupabase(obrasProcessadas)

    return NextResponse.json({
      sucesso: true,
      mensagem: `Sincronização concluída: ${totalInserido} obras atualizadas`,
      total: totalInserido
    })
  } catch (error) {
    console.error('Erro na sincronização:', error)
    return NextResponse.json(
      { erro: String(error) },
      { status: 500 }
    )
  }
}

export const maxDuration = 60

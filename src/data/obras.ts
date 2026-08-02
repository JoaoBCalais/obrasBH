export interface Obra {
  id: string
  nome: string
  local: string
  regional: string
  status: 'EM_ANDAMENTO' | 'ATRASADA' | 'PARALISADA' | 'CONCLUIDA'
  valorContrato: number
  valorGasto: number
  pctExecucao: number
  prazoOriginal: Date
  prazoAtual: Date
  empresa: string
  contrato: string
  trabalhadores: number
  fase: string
  custoDia: number
  votos: { positivos: number; negativos: number }
  relatos: { total: number; abertos: number }
}

export const obras: Obra[] = [
  {
    id: '1',
    nome: 'Trincheira Cristiano Machado x Vilarinho',
    local: 'Regional Norte',
    regional: 'Norte',
    status: 'ATRASADA',
    valorContrato: 178500000,
    valorGasto: 142800000,
    pctExecucao: 62,
    prazoOriginal: new Date('2025-12-31'),
    prazoAtual: new Date('2027-07-31'),
    empresa: 'Construtora Barbosa Mello',
    contrato: 'SMOBI-2023/041',
    trabalhadores: 285,
    fase: 'Fundação dos pilares do viaduto',
    custoDia: 195000,
    votos: { positivos: 342, negativos: 89 },
    relatos: { total: 156, abertos: 23 }
  },
  {
    id: '2',
    nome: 'Revitalização da Praça da Estação',
    local: 'Regional Centro-Sul',
    regional: 'Centro-Sul',
    status: 'EM_ANDAMENTO',
    valorContrato: 45200000,
    valorGasto: 22100000,
    pctExecucao: 48,
    prazoOriginal: new Date('2026-03-31'),
    prazoAtual: new Date('2026-03-31'),
    empresa: 'Engeform Engenharia',
    contrato: 'SMOBI-2024/012',
    trabalhadores: 92,
    fase: 'Drenagem e urbanização',
    custoDia: 68000,
    votos: { positivos: 518, negativos: 31 },
    relatos: { total: 12, abertos: 2 }
  },
  {
    id: '3',
    nome: 'Corredor BRT Avenida Antônio Carlos (Etapa 2)',
    local: 'Regional Pampulha',
    regional: 'Pampulha',
    status: 'ATRASADA',
    valorContrato: 312000000,
    valorGasto: 280800000,
    pctExecucao: 78,
    prazoOriginal: new Date('2025-06-30'),
    prazoAtual: new Date('2026-12-31'),
    empresa: 'Consórcio Via BH',
    contrato: 'SMOBI-2022/098',
    trabalhadores: 410,
    fase: 'Pavimentação e sinalização',
    custoDia: 320000,
    votos: { positivos: 189, negativos: 456 },
    relatos: { total: 234, abertos: 67 }
  },
  {
    id: '4',
    nome: 'Contenção de Encosta Morro das Pedras',
    local: 'Regional Oeste',
    regional: 'Oeste',
    status: 'EM_ANDAMENTO',
    valorContrato: 8700000,
    valorGasto: 5220000,
    pctExecucao: 55,
    prazoOriginal: new Date('2026-11-30'),
    prazoAtual: new Date('2026-11-30'),
    empresa: 'Geocontrol Fundações',
    contrato: 'SMOBI-2025/003',
    trabalhadores: 38,
    fase: 'Cortinas atirantadas',
    custoDia: 22000,
    votos: { positivos: 203, negativos: 15 },
    relatos: { total: 8, abertos: 1 }
  },
  {
    id: '5',
    nome: 'ETE Arrudas - Ampliação',
    local: 'Regional Barreiro',
    regional: 'Barreiro',
    status: 'PARALISADA',
    valorContrato: 95000000,
    valorGasto: 47500000,
    pctExecucao: 42,
    prazoOriginal: new Date('2025-08-31'),
    prazoAtual: new Date('2999-12-31'),
    empresa: 'Construtora Andrade Gutierrez',
    contrato: 'COPASA-2023/055',
    trabalhadores: 0,
    fase: 'Paralisada - Pendência ambiental',
    custoDia: 0,
    votos: { positivos: 67, negativos: 312 },
    relatos: { total: 145, abertos: 89 }
  },
  {
    id: '6',
    nome: 'Parque Linear do Ribeirão Arrudas',
    local: 'Regional Leste',
    regional: 'Leste',
    status: 'EM_ANDAMENTO',
    valorContrato: 67800000,
    valorGasto: 20340000,
    pctExecucao: 28,
    prazoOriginal: new Date('2027-12-31'),
    prazoAtual: new Date('2027-12-31'),
    empresa: 'Consórcio Arrudas Vivo',
    contrato: 'SMOBI-2025/022',
    trabalhadores: 115,
    fase: 'Terraplanagem e drenagem',
    custoDia: 85000,
    votos: { positivos: 612, negativos: 22 },
    relatos: { total: 18, abertos: 2 }
  }
]

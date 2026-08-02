// src/hooks/paralizacao.types.ts

export interface Paralizacao {
  id: number;
  id_area_empreendimento: string;
  num_cnt: string | null;
  numero_paralisacao: number;
  data_paralisacao: string; // ISO date
  data_retomada: string | null; // ISO date
  motivo_paralisacao: string | null;
  descricao_paralisacao: string | null;
  status_paralisacao: 'Em paralisação' | 'Retomada' | 'Cancelada';
  dias_paralisado: number;
  criado_em: string;
  atualizado_em: string;
}

export interface ParalizacaoComputada {
  total: number;
  ativa: Paralizacao | null;
  totalDias: number;
  listaCompleta: Paralizacao[];
}

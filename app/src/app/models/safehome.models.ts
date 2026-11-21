export type Estado = 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'SEM_CONEXAO';
export type NomeSensor = 'fumaca' | 'gas_natural' | 'gas_glp';
export type CorIonic = 'success' | 'warning' | 'danger' | 'medium';

export interface SensorStatus {
  adc_raw: number;
  limiar: number;
  estado: Estado;
}

export type SensoresStatus = Record<NomeSensor, SensorStatus>;

export interface Dispositivo {
  device_id: string;
  nome: string;
  overall_state: Estado;
  conectado: boolean;
  simulado: boolean;
  teste: boolean;
  ultima_leitura_em: string | null;
  sensores: SensoresStatus | null;
}

export interface Status {
  overall_state: Estado;
  conectado: boolean;
  limiares: Record<NomeSensor, number>;
  devices: Dispositivo[];
  simulado: boolean;
  ultima_leitura_em: string | null;
  sensores: SensoresStatus | null;
}

export interface Evento {
  sequencia: number;
  em: string;
  de: Estado | null;
  para: Estado;
  simulado: boolean;
  sensores: SensoresStatus | null;
}

export interface InfoEstado {
  rotulo: string;
  curto: string;
  descricao: string;
  cor: CorIonic;
  icone: string;
}

export const ESTADOS: Record<Estado, InfoEstado> = {
  NORMAL: {
    rotulo: 'Ambiente normal',
    curto: 'Normal',
    descricao: 'Todas as leituras estão abaixo dos limites configurados.',
    cor: 'success',
    icone: 'checkmark-circle-outline',
  },
  ATENCAO: {
    rotulo: 'Atenção',
    curto: 'Atenção',
    descricao: 'Uma leitura está próxima do limite configurado.',
    cor: 'warning',
    icone: 'warning-outline',
  },
  CRITICO: {
    rotulo: 'Alerta',
    curto: 'Alerta',
    descricao: 'Um ou mais sensores estão acima do limite de segurança.',
    cor: 'danger',
    icone: 'alert-circle-outline',
  },
  SEM_CONEXAO: {
    rotulo: 'Sem conexão',
    curto: 'Offline',
    descricao: 'Nenhuma leitura recente do dispositivo. O alarme local do ESP32 continua ativo.',
    cor: 'medium',
    icone: 'cloud-offline-outline',
  },
};

export const SENSORES: Record<NomeSensor, { nome: string; sigla: string; icone: string }> = {
  fumaca: { nome: 'Fumaça', sigla: 'MQ-2', icone: 'cloud-outline' },
  gas_natural: { nome: 'Gás natural', sigla: 'MQ-5', icone: 'flame-outline' },
  gas_glp: { nome: 'GLP', sigla: 'MQ-6', icone: 'flask-outline' },
};

export const ORDEM_SENSORES: NomeSensor[] = ['fumaca', 'gas_natural', 'gas_glp'];

export function infoEstado(estado: Estado): InfoEstado {
  return ESTADOS[estado];
}

export interface Leitura {
  recebido_em: string;
  simulado: boolean;
  fumaca: number;
  gas_natural: number;
  gas_glp: number;
}

export interface Saude {
  status: string;
  versao: string;
  uptime_s: number;
  leituras_recebidas: number;
  idade_ultima_leitura_s: number | null;
  token_obrigatorio: boolean;
  armazenamento: { gravando: boolean; erro: string | null };
}

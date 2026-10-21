import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Posição do dispositivo do técnico no momento da ação. */
export class GeoDto {
  @IsLatitude() lat: number;
  @IsLongitude() lng: number;
  @IsOptional() @IsNumber() @Min(0) precisaoM?: number;
}

/** Ações de deslocamento/check-in: geolocalização opcional (obrigatória via config). */
export class TransicaoCampoDto {
  @IsOptional() @ValidateNested() @Type(() => GeoDto) geo?: GeoDto;
  // Código de check-in exigido pelo cliente (quando o chamado tem um).
  @IsOptional() @IsString() codigo?: string;
}

/** Assinatura do cliente capturada no dispositivo (imagem já no Storage). */
export class AssinaturaDto {
  @IsString() storagePath: string;
  @IsString() @MinLength(2) assinadoPor: string;
  @IsOptional() @IsString() assinadoDoc?: string;
}

/** Avaliação do atendimento pelo cliente. */
export class AvaliacaoDto {
  @IsInt() @Min(1) @Max(5) nota: number;
  @IsOptional() @IsString() comentario?: string;
}

/** Nova visita (retorno) de um chamado: técnico + agendamento. */
export class CreateVisitaDto {
  @IsInt() tecnicoUserId: number;
  @IsOptional() @IsISO8601() agendadoPara?: string;
  @IsOptional() @IsInt() @Min(5) @Max(1440) duracaoPrevistaMin?: number;
  @IsOptional() @IsString() chamadaFixa?: string;
  @IsOptional() @IsString() observacao?: string;
}

export class OrdemRotaDto {
  @IsOptional() @IsInt() @Min(0) ordemRota?: number | null;
}

export class PausarDto {
  @IsOptional() @IsString() motivo?: string;
  @IsOptional() @IsInt() motivoId?: number;
}

export class MinhaRotaQueryDto {
  @IsISO8601() data: string;
  @IsOptional() @Type(() => Number) @IsInt() tecnicoUserId?: number;
}

/** Reagendar um chamado pela agenda. */
export class ReagendarDto {
  @IsOptional()
  @IsISO8601()
  agendadoPara?: string | null;
}

/** Atribuir/reatribuir um técnico a um chamado (cria/reatribui a visita atual). */
export class AtribuirDto {
  @IsInt() tecnicoUserId: number;
  // Valor de "chamada fixa" (custo) opcional, criado como line item.
  @IsOptional() @IsString() chamadaFixa?: string;
  @IsOptional() @IsISO8601() agendadoPara?: string;
  @IsOptional() @IsInt() @Min(5) @Max(1440) duracaoPrevistaMin?: number;
}

/** Finalização pelo técnico: horas e km informados (com limites de sanidade). */
export class FinalizarDto {
  @IsNumber() @Min(0) @Max(1000) horasTrabalhadas: number;
  @IsNumber() @Min(0) @Max(100000) kmDeslocamento: number;
  @IsOptional() @IsString() observacao?: string;
  @IsOptional() @ValidateNested() @Type(() => GeoDto) geo?: GeoDto;
  @IsOptional() @IsString() codigo?: string;
  @IsOptional()
  @ValidateNested()
  @Type(() => AssinaturaDto)
  assinatura?: AssinaturaDto;
  @IsOptional()
  @ValidateNested()
  @Type(() => AvaliacaoDto)
  avaliacao?: AvaliacaoDto;
}

export class MotivoDto {
  @IsString() @MinLength(3) motivo: string;
  // Motivo classificado do catálogo (opcional).
  @IsOptional() @IsInt() motivoId?: number;
}

export class ComentarioDto {
  @IsString() @MinLength(1) texto: string;
}

const NATUREZAS = ['custo', 'receita'];
const TIPOS = ['servico', 'material', 'deslocamento', 'extra', 'ajuste'];

/** Linha financeira manual (admin). */
export class CreateLineItemDto {
  @IsIn(NATUREZAS) natureza: 'custo' | 'receita';
  @IsIn(TIPOS) tipo:
    | 'servico'
    | 'material'
    | 'deslocamento'
    | 'extra'
    | 'ajuste';
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsNumber() quantidade?: number;
  // Valor unitário em string BR ou number; ajuste pode ser negativo.
  @IsString() valorUnitario: string;
}

export class UpdateLineItemDto {
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsNumber() quantidade?: number;
  @IsOptional() @IsString() valorUnitario?: string;
}

const PAYMENT_STATUSES = ['pendente', 'aprovado', 'pago'];
const CLIENTE_PAYMENT_STATUSES = ['pendente', 'pago'];

/** Muda o ciclo de pagamento (técnico e/ou cliente) e/ou a competência. */
export class UpdatePagamentoDto {
  @IsOptional() @IsIn(PAYMENT_STATUSES) paymentStatus?:
    | 'pendente'
    | 'aprovado'
    | 'pago';
  // Recebimento do cliente (receita): pendente <-> pago.
  @IsOptional() @IsIn(CLIENTE_PAYMENT_STATUSES) clientePaymentStatus?:
    | 'pendente'
    | 'pago';
  @IsOptional() @IsString() @Length(7, 7) paymentPeriodo?: string;
  @IsOptional() @IsString() financeiroObs?: string;
}

/**
 * Imposto da nota fiscal de um chamado. `aliquotaImpostoManual: null` volta a
 * usar a alíquota vigente da empresa; ausente mantém a atual.
 */
export class UpdateImpostoDto {
  @IsOptional() @IsBoolean() emiteNota?: boolean;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  aliquotaImpostoManual?: number | null;
}

/** Alíquota de imposto vigente da empresa (%). */
export class UpdateFinanceiroConfigDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) aliquotaImposto: number;
}

/** Pedido de URL assinada de upload da RAT (só o nome do arquivo). */
export class RatUploadUrlDto {
  @IsString() @MinLength(1) fileName: string;
}

/** Anexo de RAT (metadados; arquivo já subiu ao Storage). */
export class CreateRatDto {
  @IsString() storagePath: string;
  @IsString() fileName: string;
  @IsOptional() @IsString() mimeType?: string;
  @IsOptional() @IsInt() sizeBytes?: number;
  @IsOptional() @IsString() observacoes?: string;
}

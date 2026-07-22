import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  MinLength,
} from 'class-validator';

/** Atribuir/reatribuir um técnico a um chamado. */
export class AtribuirDto {
  @IsInt() tecnicoUserId: number;
  // Valor de "chamada fixa" (custo) opcional, criado como line item.
  @IsOptional() @IsString() chamadaFixa?: string;
}

/** Finalização pelo técnico: horas e km informados (com limites de sanidade). */
export class FinalizarDto {
  @IsNumber() @Min(0) @Max(1000) horasTrabalhadas: number;
  @IsNumber() @Min(0) @Max(100000) kmDeslocamento: number;
  @IsOptional() @IsString() observacao?: string;
}

export class MotivoDto {
  @IsString() @MinLength(3) motivo: string;
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

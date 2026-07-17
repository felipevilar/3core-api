import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

const STATUSES = [
  'aberto',
  'solicitado',
  'atribuido',
  'a_caminho',
  'em_atendimento',
  'finalizado',
  'fechado',
  'cancelado',
];
const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

/** Aceita ?x=a&x=b, ?x=a,b ou ?x=a — sempre devolve string[]. */
function toStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw: unknown[] = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [value];
  const cleaned = raw
    .map((v) => (typeof v === 'string' ? v.trim() : String(v as number)))
    .filter(Boolean);
  return cleaned.length ? cleaned : undefined;
}

function toNumberArray(value: unknown): number[] | undefined {
  const arr = toStringArray(value);
  if (!arr) return undefined;
  const nums = arr.map(Number).filter((n) => Number.isFinite(n));
  return nums.length ? nums : undefined;
}

/** Filtros da listagem de chamados (server-side) + paginação. */
export class ListChamadosQueryDto {
  @IsOptional() @IsString() search?: string;

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(STATUSES, { each: true })
  status?: string[];

  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsIn(PRIORIDADES, { each: true })
  prioridade?: string[];

  @IsOptional() @Type(() => Number) @IsInt() clientId?: number;

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  tecnicoUserIds?: number[];

  /** Filtra apenas solicitações pendentes de aceite (status = 'solicitado'). */
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return undefined;
  })
  @IsBoolean()
  solicitacaoPendente?: boolean;

  // ---- Intervalos de data (ISO date, inclusivos) ----
  @IsOptional() @IsISO8601() criadoDe?: string;
  @IsOptional() @IsISO8601() criadoAte?: string;
  @IsOptional() @IsISO8601() agendadoDe?: string;
  @IsOptional() @IsISO8601() agendadoAte?: string;
  @IsOptional() @IsISO8601() finalizadoDe?: string;
  @IsOptional() @IsISO8601() finalizadoAte?: string;

  // ---- Paginação ----
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([50, 100, 200])
  pageSize?: number;
}

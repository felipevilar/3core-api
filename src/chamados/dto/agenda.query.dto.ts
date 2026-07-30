import { IsISO8601, IsNotEmpty } from 'class-validator';
import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator';
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

/** Parâmetros para a agenda (calendário). `de` e `ate` são obrigatórios. */
export class AgendaQueryDto {
  @IsNotEmpty()
  @IsISO8601()
  de: string;

  @IsNotEmpty()
  @IsISO8601()
  ate: string;

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

  @IsOptional()
  @Transform(({ value }) => toNumberArray(value))
  @IsArray()
  @IsInt({ each: true })
  tecnicoUserIds?: number[];

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  clientId?: number;
}

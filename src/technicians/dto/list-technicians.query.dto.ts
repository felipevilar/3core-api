import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

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

/** Filtros da listagem de técnicos + paginação. */
export class ListTechniciansQueryDto {
  /** Busca por nome ou e-mail. */
  @IsOptional() @IsString() search?: string;

  /** UFs de residência (multi). */
  @IsOptional()
  @Transform(({ value }) => toStringArray(value))
  @IsArray()
  @IsString({ each: true })
  uf?: string[];

  /** Cidade presente na lista de cidades atendidas (nome). */
  @IsOptional() @IsString() cidadeAtendida?: string;

  /** Status de acesso: 'ativo' | 'inativo' (omitido = todos). */
  @IsOptional() @IsIn(['ativo', 'inativo']) status?: string;

  // ---- Paginação ----
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsIn([50, 100, 200])
  pageSize?: number;
}

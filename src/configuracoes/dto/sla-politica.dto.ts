import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

const PRIORIDADES = ['baixa', 'media', 'alta', 'urgente'];

export class CreateSlaPoliticaDto {
  @IsString() @MinLength(2) nome: string;
  @IsOptional() @IsInt() clientId?: number | null;
  @IsOptional() @IsIn(PRIORIDADES) prioridade?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(8760) horasPrimeiraVisita?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(8760) horasConclusao?: number | null;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class UpdateSlaPoliticaDto {
  @IsOptional() @IsString() @MinLength(2) nome?: string;
  @IsOptional() @IsInt() clientId?: number | null;
  @IsOptional() @IsIn(PRIORIDADES) prioridade?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(8760) horasPrimeiraVisita?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(8760) horasConclusao?: number | null;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

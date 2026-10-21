import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateServicoDto {
  @IsString() @MinLength(2) nome: string;
  @IsOptional() @IsString() descricao?: string;
  @IsOptional() @IsInt() @Min(5) @Max(1440) duracaoPadraoMin?: number;
  // String BR ("R$ 1.234,56") ou canônica ("1234.56").
  @IsOptional() @IsString() valorSugeridoCliente?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class UpdateServicoDto {
  @IsOptional() @IsString() @MinLength(2) nome?: string;
  @IsOptional() @IsString() descricao?: string | null;
  @IsOptional() @IsInt() @Min(5) @Max(1440) duracaoPadraoMin?: number | null;
  @IsOptional() @IsString() valorSugeridoCliente?: string | null;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

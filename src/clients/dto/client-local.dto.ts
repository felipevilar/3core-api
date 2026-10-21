import {
  IsBoolean,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateClientLocalDto {
  @IsString() @MinLength(2) nome: string;

  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() pontoReferencia?: string;
  @IsOptional() @IsInt() cityCode?: number;

  @IsOptional() @IsLatitude() latitude?: number;
  @IsOptional() @IsLongitude() longitude?: number;

  @IsOptional() @IsString() contatoNome?: string;
  @IsOptional() @IsString() contatoTelefone?: string;

  @IsOptional() @IsString() codigoCheckin?: string;
  @IsOptional() @IsString() codigoCheckout?: string;

  @IsOptional() @IsString() observacoes?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class UpdateClientLocalDto {
  @IsOptional() @IsString() @MinLength(2) nome?: string;

  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsString() pontoReferencia?: string;
  @IsOptional() @IsInt() cityCode?: number | null;

  @IsOptional() @IsLatitude() latitude?: number | null;
  @IsOptional() @IsLongitude() longitude?: number | null;

  @IsOptional() @IsString() contatoNome?: string;
  @IsOptional() @IsString() contatoTelefone?: string;

  @IsOptional() @IsString() codigoCheckin?: string;
  @IsOptional() @IsString() codigoCheckout?: string;

  @IsOptional() @IsString() observacoes?: string;
  @IsOptional() @IsBoolean() ativo?: boolean;
}

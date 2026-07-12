import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import type { ClientType } from '../entities/client.entity';

/** Todos os campos opcionais — só o que vier no corpo é atualizado. */
export class UpdateClientDto {
  @IsOptional() @IsIn(['pf', 'pj']) tipo?: ClientType;

  @IsOptional() @IsString() @MinLength(2) nome?: string;

  @IsOptional() @IsString() nomeFantasia?: string;
  @IsOptional() @IsString() cnpj?: string;
  @IsOptional() @IsString() cpf?: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() telefone?: string;
  @IsOptional() @IsString() contatoNome?: string;

  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsInt() cityCode?: number;

  @IsOptional() @IsString() observacoes?: string;

  @IsOptional() @IsBoolean() ativo?: boolean;
}

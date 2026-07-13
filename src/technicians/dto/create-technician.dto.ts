import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';

class EnderecoDto {
  @IsOptional() @IsString() cep?: string;
  @IsOptional() @IsString() logradouro?: string;
  @IsOptional() @IsString() numero?: string;
  @IsOptional() @IsString() complemento?: string;
  @IsOptional() @IsString() bairro?: string;
  @IsOptional() @IsInt() cityCode?: number;
}

class PixDto {
  @IsString() chavePix: string;
  @IsString() nomeTitularPix: string;
}

class DadosBancariosDto {
  @IsString() banco: string;
  @IsString() agencia: string;
  @IsString() conta: string;
  @IsString() tipoConta: string;
}

class PagamentoDto {
  @IsOptional() @ValidateNested() @Type(() => PixDto) pix?: PixDto | null;
  @IsOptional()
  @ValidateNested()
  @Type(() => DadosBancariosDto)
  dadosBancarios?: DadosBancariosDto | null;
}

class EmpresaDto {
  @IsString() nomeFantasia: string;
  @IsString() razaoSocial: string;
  @IsString() cnpj: string;
}

class CidadeAtendidaDto {
  @IsInt() cityCode: number;
  @IsOptional() @IsString() custoKm?: string;
}

/** Criação de técnico pelo dashboard (ficha completa). */
export class CreateTechnicianDto {
  @IsString() @MinLength(2) nome: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) senha: string;
  @IsString() cpf: string;
  @IsOptional() @IsString() rg?: string;
  @IsString() celular: string;

  @IsOptional() @IsBoolean() isActive?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => EnderecoDto)
  endereco?: EnderecoDto;

  @IsOptional() @IsString() enderecoEncomendas?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PagamentoDto)
  pagamento?: PagamentoDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => EmpresaDto)
  empresa?: EmpresaDto | null;

  @IsOptional() @IsArray() @IsString({ each: true }) areasAtuacao?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) ferramental?: string[];

  @IsOptional() @IsString() pretensaoValorHora?: string | null;
  @IsOptional() @IsString() custoPorKm?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CidadeAtendidaDto)
  cidadesAtendidas?: CidadeAtendidaDto[];
}

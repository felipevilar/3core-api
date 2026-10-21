import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Servico } from './entities/servico.entity';
import { CreateServicoDto, UpdateServicoDto } from './dto/servico.dto';
import { parseBrMoney } from '../common/br-money';

@Injectable()
export class ServicosService {
  constructor(
    @InjectRepository(Servico)
    private readonly repo: Repository<Servico>,
  ) {}

  list(incluirInativos = false) {
    return this.repo.find({
      where: incluirInativos ? {} : { ativo: true },
      order: { nome: 'ASC' },
    });
  }

  async findOne(id: number) {
    const servico = await this.repo.findOneBy({ id });
    if (!servico) throw new NotFoundException('Serviço não encontrado');
    return servico;
  }

  create(dto: CreateServicoDto) {
    return this.repo.save(
      this.repo.create({
        nome: dto.nome,
        descricao: dto.descricao ?? null,
        duracaoPadraoMin: dto.duracaoPadraoMin ?? null,
        valorSugeridoCliente: parseBrMoney(dto.valorSugeridoCliente),
        ativo: dto.ativo ?? true,
      }),
    );
  }

  async update(id: number, dto: UpdateServicoDto) {
    const servico = await this.findOne(id);
    if (dto.nome !== undefined) servico.nome = dto.nome;
    if (dto.descricao !== undefined) servico.descricao = dto.descricao;
    if (dto.duracaoPadraoMin !== undefined)
      servico.duracaoPadraoMin = dto.duracaoPadraoMin;
    if (dto.valorSugeridoCliente !== undefined)
      servico.valorSugeridoCliente = parseBrMoney(dto.valorSugeridoCliente);
    if (dto.ativo !== undefined) servico.ativo = dto.ativo;
    return this.repo.save(servico);
  }

  /** Desativa em vez de apagar (chamados antigos referenciam o serviço). */
  async remove(id: number) {
    const servico = await this.findOne(id);
    servico.ativo = false;
    await this.repo.save(servico);
    return { success: true };
  }
}

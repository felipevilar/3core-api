import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export interface PagamentoInfo {
  pix?: { chavePix: string; nomeTitularPix: string } | null;
  dadosBancarios?: {
    banco: string;
    agencia: string;
    conta: string;
    tipoConta: string;
  } | null;
}

export interface EmpresaInfo {
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
}

export interface CidadeAtendida {
  cidade: string;
  custoKm: string;
}

@Entity('tech_profiles')
export class TechProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @OneToOne(() => User, (user) => user.techProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'int', unique: true })
  userId: number;

  // ---- Dados pessoais / documentos ----
  @Column({ type: 'varchar', unique: true })
  cpf: string;

  @Column({ type: 'varchar', nullable: true })
  rg: string | null;

  @Column({ type: 'varchar' })
  celular: string;

  // ---- Endereço ----
  @Column({ type: 'varchar', nullable: true })
  cep: string | null;

  @Column({ type: 'varchar', nullable: true })
  logradouro: string | null;

  @Column({ type: 'varchar', nullable: true })
  numero: string | null;

  @Column({ type: 'varchar', nullable: true })
  complemento: string | null;

  @Column({ type: 'varchar', nullable: true })
  bairro: string | null;

  @Column({ type: 'varchar', nullable: true })
  cidade: string | null;

  @Column({ type: 'varchar', nullable: true })
  estado: string | null;

  @Column({ type: 'varchar', nullable: true })
  enderecoEncomendas: string | null;

  // ---- Financeiro ----
  @Column({ type: 'varchar', nullable: true })
  pretensaoValorHora: string | null;

  @Column({ type: 'varchar', nullable: true })
  custoPorKm: string | null;

  // ---- Estruturas variáveis (JSONB) ----
  @Column({ type: 'jsonb', nullable: true })
  pagamento: PagamentoInfo | null;

  @Column({ type: 'jsonb', nullable: true })
  empresa: EmpresaInfo | null;

  @Column({ type: 'jsonb', nullable: true })
  areasAtuacao: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  ferramental: string[] | null;

  @Column({ type: 'jsonb', nullable: true })
  cidadesAtendidas: CidadeAtendida[] | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

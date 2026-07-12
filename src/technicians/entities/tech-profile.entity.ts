import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { City } from '../../cities/entities/city.entity';
import { TechServiceArea } from './tech-service-area.entity';

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

  // Cidade de residência — referência ao município (código IBGE).
  @ManyToOne(() => City, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cityCode' })
  city: City | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  cityCode: number | null;

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

  // Cidades atendidas — normalizado em tech_service_areas.
  @OneToMany(() => TechServiceArea, (area) => area.techProfile, {
    cascade: true,
  })
  servedCities: TechServiceArea[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

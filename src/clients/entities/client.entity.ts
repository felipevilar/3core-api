import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from '../../cities/entities/city.entity';
import { ClientLocal } from './client-local.entity';

export type ClientType = 'pf' | 'pj';

/**
 * Cliente que abre chamados (futuramente cliente → chamado → técnico).
 * Cadastro gerenciado pelo admin — sem conta de acesso própria.
 */
@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', default: 'pj' })
  tipo: ClientType;

  // Nome de exibição (razão social para PJ, nome completo para PF).
  @Column({ type: 'varchar' })
  nome: string;

  // ---- PJ ----
  @Column({ type: 'varchar', nullable: true })
  nomeFantasia: string | null;

  @Index({ unique: true, where: '"cnpj" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true })
  cnpj: string | null;

  // ---- PF ----
  @Index({ unique: true, where: '"cpf" IS NOT NULL' })
  @Column({ type: 'varchar', nullable: true })
  cpf: string | null;

  // ---- Contato ----
  @Column({ type: 'varchar', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  telefone: string | null;

  // Pessoa de contato / responsável.
  @Column({ type: 'varchar', nullable: true })
  contatoNome: string | null;

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

  // Cidade do cliente — referência ao município (código IBGE).
  @ManyToOne(() => City, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cityCode' })
  city: City | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  cityCode: number | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  // Contratante: cliente que fatura/abre a demanda para este cliente final
  // (ex.: operadora → loja). Opcional.
  @ManyToOne(() => Client, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'contratanteId' })
  contratante: Client | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  contratanteId: number | null;

  // Locais (sites) de atendimento deste cliente.
  @OneToMany(() => ClientLocal, (l) => l.client)
  locais: ClientLocal[];

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  // Padrão de emissão de nota fiscal nos chamados deste cliente (com nota há
  // imposto sobre a receita). Cada chamado pode ajustar o seu.
  @Column({ type: 'boolean', default: true })
  emiteNotaFiscal: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { City } from '../../cities/entities/city.entity';

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

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Serviço do catálogo: padroniza o título do chamado, a duração prevista da
 * visita e sugere o valor cobrado do cliente (o admin ainda define a receita).
 */
@Entity('servicos')
export class Servico {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  nome: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'int', nullable: true })
  duracaoPadraoMin: number | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  valorSugeridoCliente: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

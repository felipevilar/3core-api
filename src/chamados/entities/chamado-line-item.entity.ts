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
import { Chamado } from './chamado.entity';

/** custo = o que o técnico ganha; receita = o que o cliente paga. */
export type LineItemNatureza = 'custo' | 'receita';

export type LineItemTipo =
  | 'servico'
  | 'material'
  | 'deslocamento'
  | 'extra'
  | 'ajuste';

/** auto_snapshot = gerada dos snapshots; manual = adicionada pelo admin. */
export type LineItemOrigem = 'auto_snapshot' | 'manual';

/**
 * Linha financeira de um chamado. Cada linha guarda o seu próprio valor
 * congelado — é a fonte da verdade do payout histórico. O custo total do
 * técnico é a soma das linhas natureza='custo'; a receita, das 'receita'.
 */
@Entity('chamado_line_items')
export class ChamadoLineItem {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, (c) => c.lineItems, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

  @Column({ type: 'varchar' })
  natureza: LineItemNatureza;

  @Column({ type: 'varchar' })
  tipo: LineItemTipo;

  @Column({ type: 'varchar', nullable: true })
  descricao: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 1 })
  quantidade: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  valorUnitario: string;

  // quantidade * valorUnitario (pode ser negativo p/ tipo='ajuste').
  @Column({ type: 'numeric', precision: 12, scale: 2 })
  valorTotal: string;

  @Column({ type: 'varchar', default: 'manual' })
  origem: LineItemOrigem;

  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

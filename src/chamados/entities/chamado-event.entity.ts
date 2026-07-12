import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Chamado } from './chamado.entity';
import { User } from '../../auth/entities/user.entity';

export type ChamadoEventTipo =
  | 'criado'
  | 'atribuido'
  | 'reatribuido'
  | 'a_caminho'
  | 'chegada'
  | 'finalizado'
  | 'fechado'
  | 'reaberto'
  | 'cancelado'
  | 'editado'
  | 'rat_anexado'
  | 'rat_removido'
  | 'line_item_alterado'
  | 'financeiro_alterado'
  | 'pagamento_alterado';

/**
 * Trilha de auditoria append-only: uma linha imutável por transição de status
 * e por ação financeira/RAT. Nunca é atualizada nem deletada. É a base da
 * correção financeira reconstruível (quem/quando/o quê + valores capturados).
 *
 * ATENÇÃO: `metadata` pode conter dados financeiros sensíveis (receita/margem);
 * o endpoint que expõe eventos DEVE filtrar metadata por permissão.
 */
@Entity('chamado_events')
export class ChamadoEvent {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, (c) => c.eventos, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

  @Column({ type: 'varchar' })
  tipo: ChamadoEventTipo;

  @Column({ type: 'varchar', nullable: true })
  statusAnterior: string | null;

  @Column({ type: 'varchar', nullable: true })
  statusNovo: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'atorUserId' })
  atorUser: User | null;

  @Column({ type: 'int', nullable: true })
  atorUserId: number | null;

  // Snapshots que sobrevivem à deleção do user.
  @Column({ type: 'varchar', nullable: true })
  atorRole: string | null;
  @Column({ type: 'varchar', nullable: true })
  atorEmail: string | null;

  @Column({ type: 'text', nullable: true })
  nota: string | null;

  // Payload capturado (snap rates, horas/km, totais congelados, antes/depois).
  // Pode conter valores de RECEITA — filtrar na serialização por permissão.
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

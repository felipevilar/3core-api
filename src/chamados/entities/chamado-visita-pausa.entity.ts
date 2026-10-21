import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ChamadoVisita } from './chamado-visita.entity';

/**
 * Intervalo de pausa dentro de uma visita em atendimento. `fimEm` nulo =
 * pausa em curso. Serve para sugerir as horas trabalhadas na finalização.
 */
@Entity('chamado_visita_pausas')
export class ChamadoVisitaPausa {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChamadoVisita, (v) => v.pausas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'visitaId' })
  visita: ChamadoVisita;

  @Index()
  @Column({ type: 'int' })
  visitaId: number;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  inicioEm: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fimEm: Date | null;

  @Column({ type: 'text', nullable: true })
  motivo: string | null;

  @Column({ type: 'int', nullable: true })
  motivoId: number | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;
}

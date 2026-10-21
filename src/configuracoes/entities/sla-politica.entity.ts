import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Política de SLA: prazos (em horas, a partir da abertura) para a 1ª visita e
 * para a conclusão. Pode ser geral, por prioridade, por cliente ou por
 * cliente+prioridade — a mais específica vence ao criar o chamado.
 */
@Entity('sla_politicas')
export class SlaPolitica {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  nome: string;

  @Index()
  @Column({ type: 'int', nullable: true })
  clientId: number | null;

  @Column({ type: 'varchar', nullable: true })
  prioridade: string | null;

  @Column({ type: 'int', nullable: true })
  horasPrimeiraVisita: number | null;

  @Column({ type: 'int', nullable: true })
  horasConclusao: number | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

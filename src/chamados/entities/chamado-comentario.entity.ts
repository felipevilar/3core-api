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

/** Comentário interno no chamado (thread entre gestão e técnico). */
@Entity('chamado_comentarios')
export class ChamadoComentario {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'autorUserId' })
  autorUser: User | null;

  @Column({ type: 'int', nullable: true })
  autorUserId: number | null;

  // Snapshot do nome (sobrevive à exclusão do usuário).
  @Column({ type: 'varchar', nullable: true })
  autorNome: string | null;

  @Column({ type: 'text' })
  texto: string;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}

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

/**
 * Relatório de Atendimento (RAT) — metadados do anexo. O arquivo vive no
 * Supabase Storage; a linha guarda o path bucket-relativo. 1:N para permitir
 * revisões (o técnico pode reenviar) sem mudança de schema.
 */
@Entity('chamado_rats')
export class ChamadoRat {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, (c) => c.rats, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

  // Path bucket-relativo no Supabase Storage (ex. chamados/{id}/{ts}-{file}).
  @Column({ type: 'varchar' })
  storagePath: string;

  @Column({ type: 'varchar' })
  fileName: string;

  @Column({ type: 'varchar', nullable: true })
  mimeType: string | null;

  @Column({ type: 'int', nullable: true })
  sizeBytes: number | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'uploadedByUserId' })
  uploadedByUser: User | null;

  @Column({ type: 'int', nullable: true })
  uploadedByUserId: number | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

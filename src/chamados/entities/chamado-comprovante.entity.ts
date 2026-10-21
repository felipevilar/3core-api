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
 * Comprovante do repasse ao técnico (metadados do anexo). O arquivo vive no
 * Supabase Storage (bucket das RATs, em `chamados/{id}/comprovantes/`); a linha
 * guarda o path bucket-relativo. 1:N para permitir mais de um comprovante
 * (ex.: pagamento parcelado ou reenvio).
 */
@Entity('chamado_comprovantes')
export class ChamadoComprovante {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, (c) => c.comprovantes, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

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

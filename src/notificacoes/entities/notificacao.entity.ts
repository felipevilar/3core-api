import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Notificação in-app de um usuário (sino do dashboard). */
@Entity('notificacoes')
@Index(['userId', 'lidaEm'])
export class Notificacao {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  userId: number;

  @Column({ type: 'varchar' })
  tipo: string;

  @Column({ type: 'varchar' })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  corpo: string | null;

  // Rota do dashboard (ex. /chamados/12).
  @Column({ type: 'varchar', nullable: true })
  link: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lidaEm: Date | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  createdAt: Date;
}

import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type MotivoTipo = 'cancelamento' | 'recusa' | 'reabertura' | 'pausa';
export const MOTIVO_TIPOS: MotivoTipo[] = [
  'cancelamento',
  'recusa',
  'reabertura',
  'pausa',
];

/** Motivo classificado (catálogo) para cancelamento/recusa/reabertura/pausa. */
@Entity('motivos')
export class Motivo {
  @PrimaryGeneratedColumn()
  id: number;

  @Index()
  @Column({ type: 'varchar' })
  tipo: MotivoTipo;

  @Column({ type: 'varchar' })
  nome: string;

  @Column({ type: 'int', default: 0 })
  ordem: number;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;
}

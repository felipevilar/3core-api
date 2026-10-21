import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Chamado } from './chamado.entity';
import { User } from '../../auth/entities/user.entity';
import { ChamadoVisitaPausa } from './chamado-visita-pausa.entity';

/** Estados de execução de UMA visita (a máquina de estados vive aqui). */
export type VisitaStatus =
  | 'solicitado'
  | 'atribuido'
  | 'a_caminho'
  | 'em_atendimento'
  | 'pausado'
  | 'finalizado'
  | 'cancelado';

/** Visitas em andamento (bloqueiam a criação de outra visita). */
export const VISITA_STATUS_ATIVOS: VisitaStatus[] = [
  'solicitado',
  'atribuido',
  'a_caminho',
  'em_atendimento',
  'pausado',
];

/**
 * Visita (agendamento/execução) de um chamado — equivalente à "Task" do
 * field service: liga a OS a um técnico numa data/hora e carrega os carimbos
 * de cada etapa, a geolocalização, a assinatura do cliente e a avaliação.
 * Um chamado pode ter N visitas (retornos); o chamado projeta a atual.
 */
@Entity('chamado_visitas')
@Unique('UQ_chamado_visitas_chamado_numero', ['chamadoId', 'numero'])
export class ChamadoVisita {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Chamado, (c) => c.visitas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'chamadoId' })
  chamado: Chamado;

  @Index()
  @Column({ type: 'int' })
  chamadoId: number;

  // Sequencial por chamado (1ª visita, 2ª visita…).
  @Column({ type: 'int' })
  numero: number;

  @Index()
  @Column({ type: 'varchar', default: 'solicitado' })
  status: VisitaStatus;

  // ---- Técnico (identidade e tarifas congeladas na atribuição) ----
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tecnicoUserId' })
  tecnicoUser: User | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  tecnicoUserId: number | null;

  @Column({ type: 'int', nullable: true })
  techProfileId: number | null;

  @Column({ type: 'varchar', nullable: true })
  snapTecnicoNome: string | null;
  @Column({ type: 'varchar', nullable: true })
  snapTecnicoEmail: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapValorHora: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapCustoPorKm: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapCustoKmCidade: string | null;

  // ---- Agendamento ----
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  agendadoPara: Date | null;

  @Column({ type: 'int', nullable: true })
  duracaoPrevistaMin: number | null;

  // Posição na rota do dia do técnico.
  @Column({ type: 'int', nullable: true })
  ordemRota: number | null;

  // Prazo para o técnico aceitar a solicitação (null = não expira).
  @Column({ type: 'timestamptz', nullable: true })
  solicitacaoExpiraEm: Date | null;

  // ---- Carimbos do ciclo ----
  @Column({ type: 'timestamptz', nullable: true })
  atribuidoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  aceitoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  visualizadoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  aCaminhoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  chegadaEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  finalizadoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  canceladoEm: Date | null;

  @Column({ type: 'text', nullable: true })
  motivoCancelamento: string | null;
  @Column({ type: 'int', nullable: true })
  motivoId: number | null;

  // ---- Execução ----
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  horasTrabalhadas: string | null;
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  kmDeslocamento: string | null;
  @Column({ type: 'text', nullable: true })
  observacao: string | null;

  // ---- Geolocalização capturada no app ----
  @Column({ type: 'double precision', nullable: true })
  aCaminhoLat: number | null;
  @Column({ type: 'double precision', nullable: true })
  aCaminhoLng: number | null;
  @Column({ type: 'double precision', nullable: true })
  chegadaLat: number | null;
  @Column({ type: 'double precision', nullable: true })
  chegadaLng: number | null;
  @Column({ type: 'double precision', nullable: true })
  chegadaPrecisaoM: number | null;
  // Distância (m) entre o check-in e o endereço do chamado, quando há coords.
  @Column({ type: 'double precision', nullable: true })
  chegadaDistanciaM: number | null;
  @Column({ type: 'double precision', nullable: true })
  finalizadoLat: number | null;
  @Column({ type: 'double precision', nullable: true })
  finalizadoLng: number | null;

  // ---- Assinatura do cliente (imagem no Storage) ----
  @Column({ type: 'varchar', nullable: true })
  assinaturaPath: string | null;
  @Column({ type: 'varchar', nullable: true })
  assinadoPor: string | null;
  @Column({ type: 'varchar', nullable: true })
  assinadoDoc: string | null;
  @Column({ type: 'timestamptz', nullable: true })
  assinadoEm: Date | null;

  // ---- Avaliação do atendimento (1–5) ----
  @Column({ type: 'smallint', nullable: true })
  avaliacaoNota: number | null;
  @Column({ type: 'text', nullable: true })
  avaliacaoComentario: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => ChamadoVisitaPausa, (p) => p.visita)
  pausas: ChamadoVisitaPausa[];
}

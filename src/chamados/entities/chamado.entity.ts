import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { City } from '../../cities/entities/city.entity';
import { User } from '../../auth/entities/user.entity';
import { ChamadoLineItem } from './chamado-line-item.entity';
import { ChamadoEvent } from './chamado-event.entity';
import { ChamadoRat } from './chamado-rat.entity';

export type ChamadoStatus =
  | 'aberto'
  | 'atribuido'
  | 'a_caminho'
  | 'em_atendimento'
  | 'finalizado'
  | 'fechado'
  | 'cancelado';

export type ChamadoPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

/** Ciclo de pagamento — SEPARADO do status operacional do chamado. */
export type PaymentStatus = 'nao_aplicavel' | 'pendente' | 'aprovado' | 'pago';

/**
 * Chamado (ticket de atendimento) — raiz agregada. Guarda o cliente, o técnico
 * executor, o estado do ciclo de vida, o snapshot congelado das tarifas do
 * técnico (para o histórico financeiro não mudar quando as tarifas mudam) e os
 * totais materializados no fechamento. Linhas/eventos/RATs penduram aqui.
 */
@Entity('chamados')
export class Chamado {
  @PrimaryGeneratedColumn()
  id: number;

  // Número humano (ex. "CH-000123"), gerado de uma SEQUENCE (sem corrida).
  @Index({ unique: true })
  @Column({ type: 'varchar', unique: true })
  codigo: string;

  // ---- Cliente / local ----
  @ManyToOne(() => Client, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Index()
  @Column({ type: 'int' })
  clientId: number;

  @ManyToOne(() => City, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cityCode' })
  city: City | null;

  @Column({ type: 'int', nullable: true })
  cityCode: number | null;

  @Column({ type: 'varchar', nullable: true })
  cep: string | null;
  @Column({ type: 'varchar', nullable: true })
  logradouro: string | null;
  @Column({ type: 'varchar', nullable: true })
  numero: string | null;
  @Column({ type: 'varchar', nullable: true })
  complemento: string | null;
  @Column({ type: 'varchar', nullable: true })
  bairro: string | null;

  // ---- Conteúdo ----
  @Column({ type: 'varchar' })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'varchar', default: 'media' })
  prioridade: ChamadoPrioridade;

  @Index()
  @Column({ type: 'varchar', default: 'aberto' })
  status: ChamadoStatus;

  @Column({ type: 'timestamptz', nullable: true })
  agendadoPara: Date | null;

  // ---- Técnico executor ----
  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'tecnicoUserId' })
  tecnicoUser: User | null;

  @Index()
  @Column({ type: 'int', nullable: true })
  tecnicoUserId: number | null;

  // Lookup auxiliar (a fonte da verdade financeira são os snapshots abaixo).
  @Column({ type: 'int', nullable: true })
  techProfileId: number | null;

  // Identidade CONGELADA do técnico (sobrevive à deleção do user).
  @Column({ type: 'varchar', nullable: true })
  snapTecnicoNome: string | null;
  @Column({ type: 'varchar', nullable: true })
  snapTecnicoEmail: string | null;

  // ---- Timestamps do ciclo de vida ----
  @Column({ type: 'timestamptz', nullable: true })
  atribuidoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  aCaminhoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  chegadaEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  finalizadoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  fechadoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  canceladoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  reabertoEm: Date | null;

  @Column({ type: 'text', nullable: true })
  motivoCancelamento: string | null;
  @Column({ type: 'text', nullable: true })
  motivoReabertura: string | null;

  // ---- Snapshot de tarifas (congelado na atribuição) ----
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapValorHora: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapCustoPorKm: string | null;
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  snapCustoKmCidade: string | null;

  // ---- Medições informadas na finalização ----
  @Column({ type: 'numeric', precision: 6, scale: 2, nullable: true })
  horasTrabalhadas: string | null;
  @Column({ type: 'numeric', precision: 10, scale: 2, nullable: true })
  kmDeslocamento: string | null;

  // ---- Totais materializados (congelados no fechamento) ----
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  custoTecnicoTotal: string;
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  valorClienteTotal: string;

  @Column({ type: 'timestamptz', nullable: true })
  valoresCongeladosEm: Date | null;

  // ---- Pagamento (ciclo separado) ----
  @Index()
  @Column({ type: 'varchar', default: 'nao_aplicavel' })
  paymentStatus: PaymentStatus;

  // Competência da folha (YYYY-MM). Default = mês da finalização (America/Sao_Paulo).
  @Index()
  @Column({ type: 'char', length: 7, nullable: true })
  paymentPeriodo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  aprovadoEm: Date | null;
  @Column({ type: 'timestamptz', nullable: true })
  pagoEm: Date | null;

  @Column({ type: 'text', nullable: true })
  financeiroObs: string | null;

  @Column({ type: 'int', nullable: true })
  createdByUserId: number | null;

  // Lock otimista contra transições concorrentes (duplo-clique / corrida).
  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  // ---- Relações filhas ----
  @OneToMany(() => ChamadoLineItem, (li) => li.chamado, { cascade: true })
  lineItems: ChamadoLineItem[];

  @OneToMany(() => ChamadoEvent, (e) => e.chamado)
  eventos: ChamadoEvent[];

  @OneToMany(() => ChamadoRat, (r) => r.chamado)
  rats: ChamadoRat[];
}

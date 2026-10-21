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
import { ChamadoVisita } from './chamado-visita.entity';
import { ClientLocal } from '../../clients/entities/client-local.entity';
import { Servico } from '../../servicos/entities/servico.entity';

export type ChamadoStatus =
  | 'aberto'
  | 'solicitado'
  | 'atribuido'
  | 'a_caminho'
  | 'em_atendimento'
  | 'pausado'
  | 'finalizado'
  | 'fechado'
  | 'cancelado';

export type ChamadoPrioridade = 'baixa' | 'media' | 'alta' | 'urgente';

/** Ciclo de pagamento AO TÉCNICO — SEPARADO do status operacional do chamado. */
export type PaymentStatus = 'nao_aplicavel' | 'pendente' | 'aprovado' | 'pago';

/** Recebimento DO CLIENTE — se a receita do chamado já foi paga por ele. */
export type ClientePaymentStatus = 'pendente' | 'pago';

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
  @Column({ type: 'varchar', nullable: true })
  pontoReferencia: string | null;

  // Local (site) do cliente de onde o endereço foi copiado — opcional.
  @ManyToOne(() => ClientLocal, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'localId' })
  local: ClientLocal | null;

  @Column({ type: 'int', nullable: true })
  localId: number | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;
  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  // Contato no local do atendimento.
  @Column({ type: 'varchar', nullable: true })
  contatoLocalNome: string | null;
  @Column({ type: 'varchar', nullable: true })
  contatoLocalTelefone: string | null;

  // Códigos exigidos no check-in / check-out (herdados do local).
  @Column({ type: 'varchar', nullable: true })
  codigoCheckin: string | null;
  @Column({ type: 'varchar', nullable: true })
  codigoCheckout: string | null;

  // ---- Conteúdo ----
  @Column({ type: 'varchar' })
  titulo: string;

  @Column({ type: 'text', nullable: true })
  descricao: string | null;

  @Column({ type: 'varchar', nullable: true })
  chamadoInterno: string | null;

  @Column({ type: 'varchar', nullable: true })
  chamadoExterno: string | null;

  @Column({ type: 'varchar', default: 'media' })
  prioridade: ChamadoPrioridade;

  // Serviço do catálogo (opcional) — padroniza título e duração prevista.
  @ManyToOne(() => Servico, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'servicoId' })
  servico: Servico | null;

  @Column({ type: 'int', nullable: true })
  servicoId: number | null;

  // ---- SLA (prazos a partir da abertura; política resolvida na criação) ----
  @Column({ type: 'int', nullable: true })
  slaPoliticaId: number | null;
  @Column({ type: 'timestamptz', nullable: true })
  prazoPrimeiraVisita: Date | null;
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  prazoConclusao: Date | null;
  // 1º check-in de qualquer visita (marco da 1ª visita).
  @Column({ type: 'timestamptz', nullable: true })
  primeiraVisitaEm: Date | null;
  @Column({ type: 'boolean', default: false })
  slaPrimeiraVisitaViolado: boolean;
  @Column({ type: 'boolean', default: false })
  slaConclusaoViolado: boolean;
  @Column({ type: 'timestamptz', nullable: true })
  slaAlertaEnviadoEm: Date | null;

  // Arquivado (só fechado/cancelado): sai da lista padrão.
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  arquivadoEm: Date | null;

  @Index()
  @Column({ type: 'varchar', default: 'aberto' })
  status: ChamadoStatus;

  // Indexado: a agenda (calendário) consulta por intervalo nesta coluna.
  // Espelha a visita atual quando existe; antes da 1ª visita é o agendamento
  // pretendido pelo gestor.
  @Index()
  @Column({ type: 'timestamptz', nullable: true })
  agendadoPara: Date | null;

  // ---- Visita atual (a execução projetada neste chamado) ----
  // O status/técnico/carimbos abaixo ESPELHAM a visita atual. `fechado` e
  // `cancelado` são estados próprios do chamado; `aberto` = sem visita ativa.
  @Column({ type: 'int', nullable: true })
  visitaAtualId: number | null;

  // ---- Técnico executor (espelho da visita atual) ----
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
  @Column({ type: 'int', nullable: true })
  motivoCancelamentoId: number | null;
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

  // ---- Imposto da nota fiscal (abatido da receita bruta) ----
  // Herdado do cliente na criação; ajustável por chamado.
  @Column({ type: 'boolean', default: false })
  emiteNota: boolean;

  // Alíquota específica deste chamado (%). Null = usa a vigente da empresa.
  @Column({ type: 'numeric', precision: 5, scale: 2, nullable: true })
  aliquotaImpostoManual: string | null;

  // Alíquota efetivamente aplicada (0 sem nota). Materializada junto com os
  // totais e congelada no fechamento.
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  aliquotaImposto: string;

  // valorClienteTotal × aliquotaImposto. Lucro = receita − imposto − custo.
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0 })
  impostoTotal: string;

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

  // ---- Recebimento do cliente (ciclo separado do pagamento ao técnico) ----
  @Index()
  @Column({ type: 'varchar', default: 'pendente' })
  clientePaymentStatus: ClientePaymentStatus;

  @Column({ type: 'timestamptz', nullable: true })
  clientePagoEm: Date | null;

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

  @OneToMany(() => ChamadoVisita, (v) => v.chamado)
  visitas: ChamadoVisita[];
}

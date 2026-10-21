import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';
import { City } from '../../cities/entities/city.entity';

/**
 * Local (site/ponto de atendimento) de um cliente. Um cliente pode ter vários
 * locais; o chamado aponta para um deles e copia o endereço (snapshot).
 */
@Entity('client_locais')
export class ClientLocal {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Client, (c) => c.locais, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'clientId' })
  client: Client;

  @Index()
  @Column({ type: 'int' })
  clientId: number;

  @Column({ type: 'varchar' })
  nome: string;

  // ---- Endereço ----
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

  @ManyToOne(() => City, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'cityCode' })
  city: City | null;

  @Column({ type: 'int', nullable: true })
  cityCode: number | null;

  @Column({ type: 'double precision', nullable: true })
  latitude: number | null;
  @Column({ type: 'double precision', nullable: true })
  longitude: number | null;

  // ---- Contato no local ----
  @Column({ type: 'varchar', nullable: true })
  contatoNome: string | null;
  @Column({ type: 'varchar', nullable: true })
  contatoTelefone: string | null;

  // Códigos exigidos pelo cliente no check-in / check-out (opcionais).
  @Column({ type: 'varchar', nullable: true })
  codigoCheckin: string | null;
  @Column({ type: 'varchar', nullable: true })
  codigoCheckout: string | null;

  @Column({ type: 'text', nullable: true })
  observacoes: string | null;

  @Column({ type: 'boolean', default: true })
  ativo: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

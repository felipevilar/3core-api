import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Id da única linha de configuração financeira. */
export const FINANCEIRO_CONFIG_ID = 1;

/**
 * Configuração financeira da empresa — linha única (id = 1, garantido por
 * CHECK no banco). Guarda a alíquota de imposto vigente sobre a nota fiscal.
 */
@Entity('financeiro_config')
export class FinanceiroConfig {
  @PrimaryColumn({ type: 'int', default: FINANCEIRO_CONFIG_ID })
  id: number;

  // Percentual (ex. "11.50" = 11,5%) aplicado à receita bruta dos chamados
  // que emitem nota e não têm alíquota própria.
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 0 })
  aliquotaImposto: string;

  @Column({ type: 'int', nullable: true })
  updatedByUserId: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

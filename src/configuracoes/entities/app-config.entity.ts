import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Id da única linha de configuração operacional. */
export const APP_CONFIG_ID = 1;

/**
 * Configurações operacionais da conta — linha única (id = 1, CHECK no banco).
 * Flags que alteram o comportamento do fluxo de chamados.
 */
@Entity('app_config')
export class AppConfig {
  @PrimaryColumn({ type: 'int', default: APP_CONFIG_ID })
  id: number;

  // Finalizar exige ao menos uma RAT anexada.
  @Column({ type: 'boolean', default: false })
  ratObrigatoria: boolean;

  // Finalizar exige assinatura do cliente.
  @Column({ type: 'boolean', default: false })
  assinaturaObrigatoria: boolean;

  // A caminho / chegada / finalizar exigem coordenadas do dispositivo.
  @Column({ type: 'boolean', default: false })
  geolocalizacaoObrigatoria: boolean;

  // Exibe a avaliação do cliente na finalização.
  @Column({ type: 'boolean', default: true })
  avaliacaoHabilitada: boolean;

  // Horas para o técnico aceitar a solicitação (null = não expira).
  @Column({ type: 'int', nullable: true })
  solicitacaoExpiraHoras: number | null;

  @Column({ type: 'boolean', default: true })
  permitirAgendarNoPassado: boolean;

  @Column({ type: 'int', nullable: true })
  updatedByUserId: number | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}

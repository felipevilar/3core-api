import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type Regiao = 'N' | 'NE' | 'CO' | 'SE' | 'S';

/**
 * Município brasileiro (referência canônica — fonte IBGE).
 * A PK é o código IBGE de 7 dígitos, chave universal para geolocalização
 * e para casar com a malha territorial (GeoJSON/TopoJSON) em mapas.
 */
@Entity('cities')
export class City {
  /** Código IBGE do município (7 dígitos). */
  @PrimaryColumn({ type: 'int' })
  code: number;

  @Column({ type: 'varchar' })
  nome: string;

  /** Nome normalizado (sem acento, minúsculo) para busca. */
  @Index()
  @Column({ type: 'varchar' })
  searchName: string;

  @Index()
  @Column({ type: 'char', length: 2 })
  uf: string;

  @Column({ type: 'varchar' })
  ufNome: string;

  /** Região: N, NE, CO, SE, S. */
  @Index()
  @Column({ type: 'varchar', length: 2 })
  regiao: Regiao;

  @Column({ type: 'double precision', nullable: true })
  lat: number | null;

  @Column({ type: 'double precision', nullable: true })
  lng: number | null;

  @Column({ type: 'boolean', default: false })
  capital: boolean;
}

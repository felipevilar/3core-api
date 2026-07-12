import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TechProfile } from './tech-profile.entity';
import { City } from '../../cities/entities/city.entity';

/**
 * Cidade atendida por um técnico (normalização do antigo JSONB cidadesAtendidas).
 * Uma linha por (técnico, cidade), com custo de deslocamento em R$/km.
 */
@Entity('tech_service_areas')
@Index(['techProfileId', 'cityCode'], { unique: true })
export class TechServiceArea {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => TechProfile, (p) => p.servedCities, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'techProfileId' })
  techProfile: TechProfile;

  @Column({ type: 'int' })
  techProfileId: number;

  @ManyToOne(() => City, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'cityCode' })
  city: City;

  @Index()
  @Column({ type: 'int' })
  cityCode: number;

  /** Custo de deslocamento em R$/km (null = não informado). */
  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  custoKm: string | null;
}

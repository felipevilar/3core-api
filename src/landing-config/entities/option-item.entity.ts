import { Column, CreateDateColumn, Entity, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm'
import { OptionGroup } from './option-group.entity'

@Entity('option_items')
export class OptionItem {
  @PrimaryGeneratedColumn()
  id: number

  @Column({ type: 'varchar' })
  label: string

  @Column({ type: 'int', default: 0 })
  order: number

  @Column({ type: 'boolean', default: true })
  active: boolean

  @ManyToOne(() => OptionGroup, (group) => group.items, { onDelete: 'CASCADE' })
  group: OptionGroup

  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date
}

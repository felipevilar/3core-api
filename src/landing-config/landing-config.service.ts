import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { OptionGroup } from './entities/option-group.entity'
import { OptionItem } from './entities/option-item.entity'

@Injectable()
export class LandingConfigService {
  constructor(
    @InjectRepository(OptionGroup)
    private readonly groupRepo: Repository<OptionGroup>,
    @InjectRepository(OptionItem)
    private readonly itemRepo: Repository<OptionItem>,
  ) {}

  findGroups(type: string) {
    return this.groupRepo.find({
      where: { type },
      relations: ['items'],
      order: { order: 'ASC', items: { order: 'ASC' } },
    })
  }

  createGroup(body: { type: string; name: string; order?: number }) {
    return this.groupRepo.save(this.groupRepo.create(body))
  }

  async updateGroup(id: number, body: { name?: string; order?: number; active?: boolean }) {
    const group = await this.groupRepo.findOneBy({ id })
    if (!group) throw new NotFoundException('Group not found')
    Object.assign(group, body)
    return this.groupRepo.save(group)
  }

  async removeGroup(id: number) {
    const group = await this.groupRepo.findOneBy({ id })
    if (!group) throw new NotFoundException('Group not found')
    return this.groupRepo.remove(group)
  }

  async createItem(groupId: number, body: { label: string; order?: number }) {
    const group = await this.groupRepo.findOneBy({ id: groupId })
    if (!group) throw new NotFoundException('Group not found')
    return this.itemRepo.save(this.itemRepo.create({ ...body, group }))
  }

  async updateItem(id: number, body: { label?: string; order?: number; active?: boolean }) {
    const item = await this.itemRepo.findOneBy({ id })
    if (!item) throw new NotFoundException('Item not found')
    Object.assign(item, body)
    return this.itemRepo.save(item)
  }

  async removeItem(id: number) {
    const item = await this.itemRepo.findOneBy({ id })
    if (!item) throw new NotFoundException('Item not found')
    return this.itemRepo.remove(item)
  }
}

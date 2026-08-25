import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Not, Repository } from 'typeorm';
import { Parent, ParentStudent } from '../entities';

export interface ParentUpsert {
  name: string;
  phone: string;
  wxOpenid?: string | null;
}

@Injectable()
export class ParentsService {
  constructor(
    @InjectRepository(Parent) private readonly repo: Repository<Parent>,
    @InjectRepository(ParentStudent) private readonly linkRepo: Repository<ParentStudent>,
  ) {}

  async list(query: { keyword?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Number(query.pageSize) || 20);
    const qb = this.repo
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.studentLinks', 'link')
      .leftJoinAndSelect('link.student', 'student')
      .orderBy('p.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword) {
      qb.where('p.name LIKE :kw OR p.phone LIKE :kw', { kw: `%${query.keyword}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async create(data: ParentUpsert) {
    await this.checkUnique(data.phone, data.wxOpenid ?? null);
    const parent = this.repo.create({
      name: data.name,
      phone: data.phone,
      wxOpenid: data.wxOpenid || null,
    });
    return this.repo.save(parent);
  }

  async update(id: number, data: Partial<ParentUpsert>) {
    const parent = await this.repo.findOne({ where: { id } });
    if (!parent) throw new NotFoundException('家长不存在');
    await this.checkUnique(data.phone, data.wxOpenid ?? null, id);
    Object.assign(parent, {
      name: data.name ?? parent.name,
      phone: data.phone ?? parent.phone,
      wxOpenid: data.wxOpenid === '' ? null : data.wxOpenid ?? parent.wxOpenid,
    });
    return this.repo.save(parent);
  }

  async remove(id: number) {
    const links = await this.linkRepo.count({ where: { parentId: id } });
    if (links > 0) throw new BadRequestException('该家长已关联孩子,请先在学员档案中解除关联');
    await this.repo.delete(id);
    return { success: true };
  }

  private async checkUnique(phone?: string, wxOpenid?: string | null, excludeId?: number) {
    if (phone) {
      const exist = await this.repo.findOne({
        where: excludeId ? { phone, id: Not(excludeId) } : { phone },
      });
      if (exist) throw new BadRequestException('手机号已被其他家长使用');
    }
    if (wxOpenid) {
      const exist = await this.repo.findOne({
        where: excludeId ? { wxOpenid, id: Not(excludeId) } : { wxOpenid },
      });
      if (exist) throw new BadRequestException('该微信 openid 已绑定其他家长');
    }
  }
}

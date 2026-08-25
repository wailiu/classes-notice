import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';
import { Teacher, ClassEntity } from '../entities';

export interface TeacherUpsert {
  name: string;
  phone: string;
  wxOpenid?: string | null;
  subjects?: string | null;
  status?: string;
}

@Injectable()
export class TeachersService {
  constructor(
    @InjectRepository(Teacher) private readonly repo: Repository<Teacher>,
    @InjectRepository(ClassEntity) private readonly classRepo: Repository<ClassEntity>,
  ) {}

  async list(query: { keyword?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Number(query.pageSize) || 20);
    const qb = this.repo
      .createQueryBuilder('t')
      .orderBy('t.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.keyword) {
      qb.where('t.name LIKE :kw OR t.phone LIKE :kw', { kw: `%${query.keyword}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async create(data: TeacherUpsert) {
    await this.checkUnique(data.phone, data.wxOpenid ?? null);
    const teacher = this.repo.create({
      name: data.name,
      phone: data.phone,
      wxOpenid: data.wxOpenid || null,
      subjects: data.subjects || null,
      status: data.status ?? 'active',
    });
    return this.repo.save(teacher);
  }

  async update(id: number, data: Partial<TeacherUpsert>) {
    const teacher = await this.repo.findOne({ where: { id } });
    if (!teacher) throw new NotFoundException('老师不存在');
    await this.checkUnique(data.phone, data.wxOpenid ?? null, id);
    Object.assign(teacher, {
      name: data.name ?? teacher.name,
      phone: data.phone ?? teacher.phone,
      wxOpenid: data.wxOpenid === '' ? null : data.wxOpenid ?? teacher.wxOpenid,
      subjects: data.subjects ?? teacher.subjects,
      status: data.status ?? teacher.status,
    });
    return this.repo.save(teacher);
  }

  async remove(id: number) {
    const count = await this.classRepo.count({ where: { teacherId: id } });
    if (count > 0) throw new BadRequestException('该老师存在班级排课,请先调整班级授课老师');
    await this.repo.delete(id);
    return { success: true };
  }

  private async checkUnique(phone?: string, wxOpenid?: string | null, excludeId?: number) {
    if (phone) {
      const exist = await this.repo.findOne({
        where: excludeId ? { phone, id: Not(excludeId) } : { phone },
      });
      if (exist) throw new BadRequestException('手机号已被其他老师使用');
    }
    if (wxOpenid) {
      const exist = await this.repo.findOne({
        where: excludeId ? { wxOpenid, id: Not(excludeId) } : { wxOpenid },
      });
      if (exist) throw new BadRequestException('该微信 openid 已绑定其他老师');
    }
  }
}

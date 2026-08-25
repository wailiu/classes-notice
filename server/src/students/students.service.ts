import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { Student, ParentStudent, Parent, CoursePackage, Booking } from '../entities';

export interface StudentUpsert {
  name: string;
  gender?: string;
  birthday?: string | null;
  status?: 'active' | 'inactive';
  remark?: string | null;
}

@Injectable()
export class StudentsService {
  constructor(
    @InjectRepository(Student) private readonly repo: Repository<Student>,
    @InjectRepository(ParentStudent) private readonly linkRepo: Repository<ParentStudent>,
    @InjectRepository(Parent) private readonly parentRepo: Repository<Parent>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
  ) {}

  async list(query: { keyword?: string; status?: string; page?: number; pageSize?: number }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Number(query.pageSize) || 20);
    const where: Record<string, unknown> = {};
    if (query.keyword) where.name = Like(`%${query.keyword}%`);
    if (query.status) where.status = query.status;
    const [items, total] = await this.repo.findAndCount({
      where,
      relations: { parentLinks: { parent: true } },
      order: { id: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total, page, pageSize };
  }

  async detail(id: number) {
    const student = await this.repo.findOne({
      where: { id },
      relations: { parentLinks: { parent: true } },
    });
    if (!student) throw new NotFoundException('学员不存在');
    const packages = await this.pkgRepo.find({
      where: { studentId: id },
      relations: { course: true },
      order: { id: 'DESC' },
    });
    const bookings = await this.bookingRepo.find({
      where: { studentId: id },
      relations: { lesson: { classEntity: { course: true, teacher: true } } },
      order: { id: 'DESC' },
      take: 50,
    });
    return { ...student, packages, bookings };
  }

  async create(data: StudentUpsert) {
    const student = this.repo.create({
      name: data.name,
      gender: data.gender ?? 'unknown',
      birthday: data.birthday || null,
      status: data.status ?? 'active',
      remark: data.remark || null,
    });
    return this.repo.save(student);
  }

  async update(id: number, data: Partial<StudentUpsert>) {
    const student = await this.repo.findOne({ where: { id } });
    if (!student) throw new NotFoundException('学员不存在');
    Object.assign(student, {
      ...data,
      birthday: data.birthday === '' ? null : data.birthday ?? student.birthday,
    });
    return this.repo.save(student);
  }

  async remove(id: number) {
    const count = await this.bookingRepo.count({ where: { studentId: id } });
    if (count > 0) {
      throw new BadRequestException('该学员存在预约记录,请改为"停课"状态而非删除');
    }
    await this.repo.delete(id);
    return { success: true };
  }

  /** 覆盖式设置学员的家长关联 */
  async setParents(id: number, links: { parentId: number; relation: string }[]) {
    const student = await this.repo.findOne({ where: { id } });
    if (!student) throw new NotFoundException('学员不存在');
    for (const link of links) {
      const parent = await this.parentRepo.findOne({ where: { id: link.parentId } });
      if (!parent) throw new BadRequestException(`家长 ID ${link.parentId} 不存在`);
    }
    await this.linkRepo.delete({ studentId: id });
    if (links.length) {
      await this.linkRepo.save(
        links.map((l) =>
          this.linkRepo.create({ studentId: id, parentId: l.parentId, relation: l.relation || '家长' }),
        ),
      );
    }
    return this.detail(id);
  }
}

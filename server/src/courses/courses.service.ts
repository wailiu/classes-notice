import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Course, ClassEntity } from '../entities';

export interface CourseUpsert {
  name: string;
  description?: string | null;
  unitPrice?: number;
  status?: string;
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectRepository(Course) private readonly repo: Repository<Course>,
    @InjectRepository(ClassEntity) private readonly classRepo: Repository<ClassEntity>,
  ) {}

  list() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  async create(data: CourseUpsert) {
    const exist = await this.repo.findOne({ where: { name: data.name } });
    if (exist) throw new BadRequestException('科目名称已存在');
    return this.repo.save(
      this.repo.create({
        name: data.name,
        description: data.description || null,
        unitPrice: String(data.unitPrice ?? 0),
        status: data.status ?? 'active',
      }),
    );
  }

  async update(id: number, data: Partial<CourseUpsert>) {
    const course = await this.repo.findOne({ where: { id } });
    if (!course) throw new NotFoundException('科目不存在');
    Object.assign(course, {
      name: data.name ?? course.name,
      description: data.description ?? course.description,
      unitPrice: data.unitPrice !== undefined ? String(data.unitPrice) : course.unitPrice,
      status: data.status ?? course.status,
    });
    return this.repo.save(course);
  }

  async remove(id: number) {
    const count = await this.classRepo.count({ where: { courseId: id } });
    if (count > 0) throw new BadRequestException('该科目下已有班级,无法删除,可改为停用');
    await this.repo.delete(id);
    return { success: true };
  }
}

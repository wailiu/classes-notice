import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';
import { CoursePackage, Student, Course, Payment, Booking } from '../entities';

export interface PackageCreate {
  studentId: number;
  /** 必填:课时按课种消耗,不再支持不绑定课种的"通用包" */
  courseId: number;
  name: string;
  totalLessons: number;
  validUntil?: string | null;
  /** 同时生成缴费记录 */
  payment?: { amount: number; method: string; remark?: string };
}

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(CoursePackage) private readonly repo: Repository<CoursePackage>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
  ) {}

  async list(query: {
    studentId?: number;
    status?: string;
    lowRemaining?: number;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Number(query.pageSize) || 20);
    const qb = this.repo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.student', 'student')
      .leftJoinAndSelect('pkg.course', 'course')
      .orderBy('pkg.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.studentId) qb.andWhere('pkg.studentId = :sid', { sid: Number(query.studentId) });
    if (query.status) qb.andWhere('pkg.status = :status', { status: query.status });
    if (query.lowRemaining !== undefined && query.lowRemaining !== null && `${query.lowRemaining}` !== '') {
      qb.andWhere('pkg.remainingLessons <= :low', { low: Number(query.lowRemaining) });
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  async create(data: PackageCreate) {
    const student = await this.studentRepo.findOne({ where: { id: data.studentId } });
    if (!student) throw new BadRequestException('学员不存在');
    if (!data.courseId) {
      throw new BadRequestException('请选择课时包绑定的课种(不同课种费用不同,不再支持通用课时包)');
    }
    const course = await this.courseRepo.findOne({ where: { id: data.courseId } });
    if (!course) throw new BadRequestException('课种不存在');
    if (data.validUntil && !dayjs(data.validUntil).isValid()) {
      throw new BadRequestException('有效期日期不合法');
    }

    return this.repo.manager.transaction(async (em) => {
      const pkg = await em.save(
        em.create(CoursePackage, {
          studentId: data.studentId,
          courseId: data.courseId,
          name: data.name,
          totalLessons: data.totalLessons,
          remainingLessons: data.totalLessons,
          validUntil: data.validUntil || null,
          status: 'active',
        }),
      );
      if (data.payment) {
        await em.save(
          em.create(Payment, {
            serialNo: `P${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 9000 + 1000)}`,
            studentId: data.studentId,
            packageId: pkg.id,
            amount: String(data.payment.amount),
            method: data.payment.method as Payment['method'],
            status: 'paid',
            paidAt: new Date(),
            remark: data.payment.remark || null,
          }),
        );
      }
      return pkg;
    });
  }

  /** 手动调整剩余课时(补课/赠课/纠错),记录在备注习惯上由前端说明 */
  async adjust(id: number, delta: number) {
    const pkg = await this.repo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('课时包不存在');
    const next = pkg.remainingLessons + delta;
    if (next < 0) throw new BadRequestException('剩余课时不能为负');
    pkg.remainingLessons = next;
    if (next === 0 && pkg.status === 'active') pkg.status = 'finished';
    if (next > 0 && pkg.status === 'finished') pkg.status = 'active';
    return this.repo.save(pkg);
  }

  async update(id: number, data: { name?: string; validUntil?: string | null; status?: string }) {
    const pkg = await this.repo.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('课时包不存在');
    Object.assign(pkg, {
      name: data.name ?? pkg.name,
      validUntil: data.validUntil === '' ? null : data.validUntil ?? pkg.validUntil,
      status: (data.status as CoursePackage['status']) ?? pkg.status,
    });
    return this.repo.save(pkg);
  }

  async remove(id: number) {
    const used = await this.bookingRepo.count({ where: { packageId: id } });
    if (used > 0) throw new BadRequestException('该课时包已有预约扣课记录,无法删除');
    await this.repo.delete(id);
    return { success: true };
  }
}

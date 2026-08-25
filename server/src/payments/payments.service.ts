import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';
import { Payment, Student, CoursePackage } from '../entities';

export interface PaymentCreate {
  studentId: number;
  packageId?: number | null;
  amount: number;
  method: string;
  paidAt?: string;
  remark?: string | null;
}

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment) private readonly repo: Repository<Payment>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
  ) {}

  async list(query: {
    studentId?: number;
    status?: string;
    method?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Number(query.pageSize) || 20);
    const qb = this.repo
      .createQueryBuilder('pay')
      .leftJoinAndSelect('pay.student', 'student')
      .leftJoinAndSelect('pay.coursePackage', 'pkg')
      .orderBy('pay.paidAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.studentId) qb.andWhere('pay.studentId = :sid', { sid: Number(query.studentId) });
    if (query.status) qb.andWhere('pay.status = :status', { status: query.status });
    if (query.method) qb.andWhere('pay.method = :method', { method: query.method });
    if (query.from) qb.andWhere('pay.paidAt >= :from', { from: `${query.from} 00:00:00` });
    if (query.to) qb.andWhere('pay.paidAt <= :to', { to: `${query.to} 23:59:59` });
    const [items, total] = await qb.getManyAndCount();
    const sumRow = await qb.clone().select('COALESCE(SUM(pay.amount), 0)', 'sum').getRawOne();
    return { items, total, page, pageSize, sumAmount: Number(sumRow?.sum ?? 0) };
  }

  async create(data: PaymentCreate) {
    const student = await this.studentRepo.findOne({ where: { id: data.studentId } });
    if (!student) throw new BadRequestException('学员不存在');
    if (data.packageId) {
      const pkg = await this.pkgRepo.findOne({ where: { id: data.packageId } });
      if (!pkg) throw new BadRequestException('课时包不存在');
      if (pkg.studentId !== data.studentId) throw new BadRequestException('课时包不属于该学员');
    }
    return this.repo.save(
      this.repo.create({
        serialNo: `P${dayjs().format('YYYYMMDDHHmmss')}${Math.floor(Math.random() * 9000 + 1000)}`,
        studentId: data.studentId,
        packageId: data.packageId || null,
        amount: String(data.amount),
        method: data.method as Payment['method'],
        status: 'paid',
        paidAt: data.paidAt ? new Date(data.paidAt) : new Date(),
        remark: data.remark || null,
      }),
    );
  }

  /** 退费:流水改为 refunded;若关联课时包则同时将包置为 refunded 并清零剩余课时 */
  async refund(id: number) {
    const payment = await this.repo.findOne({ where: { id } });
    if (!payment) throw new NotFoundException('缴费记录不存在');
    if (payment.status === 'refunded') throw new BadRequestException('该记录已退费');
    return this.repo.manager.transaction(async (em) => {
      payment.status = 'refunded';
      await em.save(payment);
      if (payment.packageId) {
        const pkg = await em.findOne(CoursePackage, { where: { id: payment.packageId } });
        if (pkg) {
          pkg.status = 'refunded';
          pkg.remainingLessons = 0;
          await em.save(pkg);
        }
      }
      return payment;
    });
  }
}

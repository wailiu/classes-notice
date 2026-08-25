import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import dayjs from 'dayjs';
import { Student, Teacher, Lesson, CoursePackage, Payment } from '../entities';

/** 剩余课时预警阈值 */
const LOW_HOURS_THRESHOLD = Number(process.env.LOW_HOURS_THRESHOLD || 3);

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(Teacher) private readonly teacherRepo: Repository<Teacher>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
  ) {}

  async summary() {
    const today = dayjs().format('YYYY-MM-DD');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD 00:00:00');
    const [activeStudents, activeTeachers, todayLessons, activePackages] = await Promise.all([
      this.studentRepo.count({ where: { status: 'active' } }),
      this.teacherRepo.count({ where: { status: 'active' } }),
      this.lessonRepo.count({ where: { date: today, status: 'scheduled' } }),
      this.pkgRepo.count({ where: { status: 'active' } }),
    ]);
    const monthPaid = await this.paymentRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.amount), 0)', 'sum')
      .where("p.status = 'paid'")
      .andWhere('p.paidAt >= :monthStart', { monthStart })
      .getRawOne();
    return {
      activeStudents,
      activeTeachers,
      todayLessons,
      activePackages,
      monthIncome: Number(monthPaid?.sum ?? 0),
    };
  }

  /** 今日待上课列表(含预约人数) */
  todayLessons() {
    const today = dayjs().format('YYYY-MM-DD');
    return this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .where('lesson.date = :today', { today })
      .orderBy('lesson.startTime', 'ASC')
      .getMany();
  }

  /** 剩余课时预警列表 */
  lowHours(threshold?: number) {
    const limit = threshold ?? LOW_HOURS_THRESHOLD;
    return this.pkgRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.student', 'student')
      .leftJoinAndSelect('pkg.course', 'course')
      .where("pkg.status = 'active'")
      .andWhere('pkg.remainingLessons <= :limit', { limit })
      .orderBy('pkg.remainingLessons', 'ASC')
      .getMany();
  }
}

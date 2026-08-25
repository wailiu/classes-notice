import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { Booking, Lesson, CoursePackage, Student } from '../entities';

/** 开课前多少小时内不允许(家长)取消预约 */
export const CANCEL_DEADLINE_HOURS = Number(process.env.CANCEL_DEADLINE_HOURS || 2);

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking) private readonly repo: Repository<Booking>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    private readonly dataSource: DataSource,
  ) {}

  async list(query: {
    lessonId?: number;
    studentId?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(200, Number(query.pageSize) || 50);
    const qb = this.repo
      .createQueryBuilder('b')
      .leftJoinAndSelect('b.student', 'student')
      .leftJoinAndSelect('b.coursePackage', 'pkg')
      .leftJoinAndSelect('b.lesson', 'lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .orderBy('b.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);
    if (query.lessonId) qb.andWhere('b.lessonId = :lid', { lid: Number(query.lessonId) });
    if (query.studentId) qb.andWhere('b.studentId = :sid', { sid: Number(query.studentId) });
    if (query.status) qb.andWhere('b.status = :status', { status: query.status });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  /**
   * 预约课次(核心规则):
   * 1. 课次存在、状态 scheduled、未开始
   * 2. 学员在读
   * 3. 未重复预约同一课次
   * 4. 班级容量未满
   * 5. 同一时间段无冲突预约
   * 6. 课时严格按课种消耗:仅可使用与该课次课种一致的课时包(剩余>0、未过期),
   *    未绑定课种的"通用包"一律不可用于预约;预约即扣 1 课时
   */
  async book(params: {
    studentId: number;
    lessonId: number;
    packageId?: number;
    source?: string;
    now?: Date;
  }) {
    const now = params.now ?? new Date();
    return this.dataSource.transaction(async (em) => {
      const lesson = await em.findOne(Lesson, {
        where: { id: params.lessonId },
        relations: { classEntity: true },
      });
      if (!lesson) throw new NotFoundException('课次不存在');
      if (lesson.status !== 'scheduled') throw new BadRequestException('该课次不可预约(已取消或已结课)');
      const lessonStart = dayjs(`${dayjs(lesson.date).format('YYYY-MM-DD')} ${lesson.startTime}`);
      if (!lessonStart.isAfter(dayjs(now))) throw new BadRequestException('该课次已开始,无法预约');

      const student = await em.findOne(Student, { where: { id: params.studentId } });
      if (!student) throw new NotFoundException('学员不存在');
      if (student.status !== 'active') throw new BadRequestException('学员已停课,无法预约');

      const dup = await em.findOne(Booking, {
        where: {
          studentId: params.studentId,
          lessonId: params.lessonId,
          status: In(['booked', 'checked_in']),
        },
      });
      if (dup) throw new BadRequestException('该学员已预约本课次,请勿重复预约');

      const bookedCount = await em.count(Booking, {
        where: { lessonId: params.lessonId, status: In(['booked', 'checked_in']) },
      });
      if (bookedCount >= lesson.classEntity.capacity) {
        throw new BadRequestException('该课次名额已满');
      }

      // 时间冲突:同日期已有有效预约,且时间段重叠
      const sameDay = await em
        .createQueryBuilder(Booking, 'b')
        .innerJoinAndSelect('b.lesson', 'l')
        .where('b.studentId = :sid', { sid: params.studentId })
        .andWhere("b.status IN ('booked','checked_in')")
        .andWhere('l.date = :date', { date: dayjs(lesson.date).format('YYYY-MM-DD') })
        .getMany();
      const overlap = sameDay.find(
        (b) => b.lesson.startTime < lesson.endTime && lesson.startTime < b.lesson.endTime,
      );
      if (overlap) throw new BadRequestException('该学员同一时间段已有其他预约,时间冲突');

      // 选择课时包并加悲观锁,防止并发扣课超扣
      let pkg: CoursePackage | null;
      if (params.packageId) {
        pkg = await em.findOne(CoursePackage, {
          where: { id: params.packageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!pkg || pkg.studentId !== params.studentId) {
          throw new BadRequestException('课时包不存在或不属于该学员');
        }
        this.assertPackageUsable(pkg, lesson.classEntity.courseId, now);
      } else {
        pkg = await this.pickPackage(em, params.studentId, lesson.classEntity.courseId, now);
      }

      pkg.remainingLessons -= 1;
      if (pkg.remainingLessons === 0) pkg.status = 'finished';
      await em.save(pkg);

      const booking = await em.save(
        em.create(Booking, {
          studentId: params.studentId,
          lessonId: params.lessonId,
          packageId: pkg.id,
          status: 'booked',
          source: params.source ?? 'admin',
        }),
      );
      return booking;
    });
  }

  /**
   * 取消预约:退回课时。
   * 家长端受"开课前 N 小时"限制,后台可强制取消。
   */
  async cancel(bookingId: number, options: { force?: boolean; parentStudentIds?: number[]; now?: Date } = {}) {
    const now = options.now ?? new Date();
    return this.dataSource.transaction(async (em) => {
      const booking = await em.findOne(Booking, {
        where: { id: bookingId },
        relations: { lesson: true },
      });
      if (!booking) throw new NotFoundException('预约不存在');
      if (options.parentStudentIds && !options.parentStudentIds.includes(booking.studentId)) {
        throw new BadRequestException('无权操作该预约');
      }
      if (booking.status !== 'booked') {
        throw new BadRequestException('仅"已预约"状态可取消(已签到/已取消不可再取消)');
      }
      const lessonStart = dayjs(
        `${dayjs(booking.lesson.date).format('YYYY-MM-DD')} ${booking.lesson.startTime}`,
      );
      if (!options.force) {
        const deadline = lessonStart.subtract(CANCEL_DEADLINE_HOURS, 'hour');
        if (dayjs(now).isAfter(deadline)) {
          throw new BadRequestException(`开课前 ${CANCEL_DEADLINE_HOURS} 小时内不可取消,请联系前台处理`);
        }
      }
      booking.status = 'cancelled';
      booking.cancelledAt = now;
      await em.save(booking);
      if (booking.packageId) {
        const pkg = await em.findOne(CoursePackage, {
          where: { id: booking.packageId },
          lock: { mode: 'pessimistic_write' },
        });
        if (pkg) {
          pkg.remainingLessons += 1;
          if (pkg.status === 'finished') pkg.status = 'active';
          await em.save(pkg);
        }
      }
      return booking;
    });
  }

  /** 签到核销(课时在预约时已扣,签到仅确认到课) */
  async checkin(bookingId: number) {
    const booking = await this.repo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('预约不存在');
    if (booking.status !== 'booked') throw new BadRequestException('仅"已预约"状态可签到');
    booking.status = 'checked_in';
    booking.checkinAt = new Date();
    return this.repo.save(booking);
  }

  /** 标记缺勤(不退课时) */
  async markNoShow(bookingId: number) {
    const booking = await this.repo.findOne({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('预约不存在');
    if (booking.status !== 'booked') throw new BadRequestException('仅"已预约"状态可标记缺勤');
    booking.status = 'no_show';
    return this.repo.save(booking);
  }

  private assertPackageUsable(pkg: CoursePackage, courseId: number, now: Date) {
    if (!pkg.courseId) {
      throw new BadRequestException('该课时包未绑定课种(通用包),不可用于预约,请联系前台换绑课种');
    }
    if (pkg.courseId !== courseId) {
      throw new BadRequestException('课时包课种与该课次不一致,不同课种费用不同,不可跨课种抵扣');
    }
    if (pkg.status !== 'active') throw new BadRequestException('课时包不可用(已用完/过期/退款)');
    if (pkg.remainingLessons <= 0) throw new BadRequestException('该课种剩余课时不足,请先续费');
    if (pkg.validUntil && dayjs(pkg.validUntil).endOf('day').isBefore(dayjs(now))) {
      throw new BadRequestException('该课种课时包已过期,请先续费');
    }
  }

  /**
   * 自动挑包:严格限定与课次同课种的课时包(通用包不参与),先到期的先用。
   * 挑不到时按原因抛出明确错误:未购买该课种 / 剩余课时不足 / 已过期。
   */
  private async pickPackage(
    em: EntityManager,
    studentId: number,
    courseId: number,
    now: Date,
  ): Promise<CoursePackage> {
    const sameCourse = await em.find(CoursePackage, {
      where: { studentId, courseId },
      lock: { mode: 'pessimistic_write' },
    });
    if (sameCourse.length === 0) {
      throw new BadRequestException('未购买该课种课时,无法预约');
    }
    const usable = sameCourse.filter((p) => {
      if (p.status !== 'active') return false;
      if (p.remainingLessons <= 0) return false;
      if (p.validUntil && dayjs(p.validUntil).endOf('day').isBefore(dayjs(now))) return false;
      return true;
    });
    if (usable.length === 0) {
      const expiredOnly = sameCourse.every(
        (p) =>
          p.status === 'expired' ||
          (p.validUntil && dayjs(p.validUntil).endOf('day').isBefore(dayjs(now))),
      );
      throw new BadRequestException(
        expiredOnly ? '该课种课时包已过期,请先续费' : '该课种剩余课时不足,请先续费',
      );
    }
    usable.sort((a, b) => {
      const aExp = a.validUntil ?? '9999-12-31';
      const bExp = b.validUntil ?? '9999-12-31';
      return aExp < bExp ? -1 : aExp > bExp ? 1 : 0;
    });
    return usable[0];
  }
}

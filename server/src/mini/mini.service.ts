import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import {
  Parent,
  ParentStudent,
  Student,
  Teacher,
  Lesson,
  CoursePackage,
  Booking,
  Course,
  ClassEntity,
  Payment,
} from '../entities';
import { BookingsService } from '../bookings/bookings.service';

const WEEKDAY_TEXT = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 按开始时间划分时段:12:00 前为上午,18:00 前为下午,其余为晚上 */
function periodOf(startTime: string): string {
  if (startTime < '12:00') return '上午';
  if (startTime < '18:00') return '下午';
  return '晚上';
}

/** 校长端:剩余课时预警阈值(与后台工作台一致) */
const LOW_HOURS_LIMIT = Number(process.env.LOW_HOURS_THRESHOLD || 3);

/** 校长端:缴费方式中文文案 */
const METHOD_TEXT: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  cash: '现金',
  card: '银行卡',
  other: '其他',
};

@Injectable()
export class MiniService {
  constructor(
    @InjectRepository(Parent) private readonly parentRepo: Repository<Parent>,
    @InjectRepository(ParentStudent) private readonly linkRepo: Repository<ParentStudent>,
    @InjectRepository(Teacher) private readonly teacherRepo: Repository<Teacher>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(ClassEntity) private readonly classRepo: Repository<ClassEntity>,
    private readonly bookings: BookingsService,
    @InjectRepository(Student) private readonly studentRepo: Repository<Student>,
    @InjectRepository(Payment) private readonly paymentRepo: Repository<Payment>,
  ) {}

  /** 家长名下孩子列表(含剩余课时汇总) */
  async parentChildren(parentId: number) {
    const links = await this.linkRepo.find({
      where: { parentId },
      relations: { student: true },
    });
    const result: Array<Record<string, unknown>> = [];
    for (const link of links) {
      const packages = await this.pkgRepo.find({
        where: { studentId: link.studentId, status: 'active' },
        relations: { course: true },
      });
      const totalRemaining = packages.reduce((acc, p) => acc + p.remainingLessons, 0);
      result.push({
        studentId: link.studentId,
        name: link.student.name,
        gender: link.student.gender,
        birthday: link.student.birthday,
        status: link.student.status,
        relation: link.relation,
        totalRemaining,
        packages: packages.map((p) => ({
          id: p.id,
          name: p.name,
          courseName: p.course?.name ?? '未绑定课种(不可预约)',
          remainingLessons: p.remainingLessons,
          totalLessons: p.totalLessons,
          validUntil: p.validUntil,
        })),
      });
    }
    return result;
  }

  private async assertChildBelongsToParent(parentId: number, studentId: number) {
    const link = await this.linkRepo.findOne({ where: { parentId, studentId } });
    if (!link) throw new ForbiddenException('该孩子不在您的名下');
  }

  /**
   * 可预约课次列表(未来 N 天)。
   * 课表仍展示学校全部课种(让家长了解都有哪些课),但每个课次都带 canBook + reason:
   * 课时严格按课种消耗,未购买该课种/该课种课时不足的课次前端应禁用预约。
   */
  async availableLessons(parentId: number, studentId: number, days = 14) {
    await this.assertChildBelongsToParent(parentId, studentId);
    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(days, 'day').format('YYYY-MM-DD');
    const lessons = await this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .where('lesson.date BETWEEN :from AND :to', { from, to })
      .andWhere("lesson.status = 'scheduled'")
      .andWhere("cls.status = 'active'")
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.startTime', 'ASC')
      .getMany();

    const myBookings = await this.bookingRepo.find({
      where: { studentId, status: In(['booked', 'checked_in']) },
      select: { lessonId: true },
    });
    const bookedLessonIds = new Set(myBookings.map((b) => b.lessonId));

    // 该学员名下全部课时包(含已用完/过期),用于区分"未购买该课种"和"该课种课时不足"
    const allPackages = await this.pkgRepo.find({ where: { studentId } });
    const now = dayjs();
    const purchasedCourseIds = new Set(
      allPackages.filter((p) => p.courseId).map((p) => p.courseId as number),
    );
    const usableRemainingByCourse = new Map<number, number>();
    for (const p of allPackages) {
      if (!p.courseId) continue; // 未绑定课种的通用包不可用于预约
      if (p.status !== 'active') continue;
      if (p.remainingLessons <= 0) continue;
      if (p.validUntil && dayjs(p.validUntil).endOf('day').isBefore(now)) continue;
      usableRemainingByCourse.set(
        p.courseId,
        (usableRemainingByCourse.get(p.courseId) ?? 0) + p.remainingLessons,
      );
    }

    return lessons.map((lesson) => {
      const bookedCount = (lesson as Lesson & { bookedCount?: number }).bookedCount ?? 0;
      const remainingSeats = Math.max(0, lesson.classEntity.capacity - bookedCount);
      const alreadyBooked = bookedLessonIds.has(lesson.id);
      const courseId = lesson.classEntity.courseId;
      const courseRemaining = usableRemainingByCourse.get(courseId) ?? 0;

      let canBook = false;
      let reason = '';
      if (alreadyBooked) {
        reason = '已预约';
      } else if (remainingSeats <= 0) {
        reason = '名额已满';
      } else if (!purchasedCourseIds.has(courseId)) {
        reason = '未购买该课种';
      } else if (courseRemaining <= 0) {
        reason = '该课种课时不足';
      } else {
        canBook = true;
        reason = '可预约';
      }

      return {
        id: lesson.id,
        date: dayjs(lesson.date).format('YYYY-MM-DD'),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        className: lesson.classEntity.name,
        courseName: lesson.classEntity.course.name,
        teacherName: lesson.classEntity.teacher.name,
        room: lesson.classEntity.room,
        capacity: lesson.classEntity.capacity,
        bookedCount,
        remainingSeats,
        alreadyBooked,
        courseRemaining,
        canBook,
        reason,
      };
    });
  }

  /** 学员的"可用课时"汇总:仅统计绑定课种、active、剩余>0、未过期的包 */
  private usableRemainingByCourse(packages: CoursePackage[], now = dayjs()) {
    const map = new Map<number, number>();
    for (const p of packages) {
      if (!p.courseId) continue;
      if (p.status !== 'active') continue;
      if (p.remainingLessons <= 0) continue;
      if (p.validUntil && dayjs(p.validUntil).endOf('day').isBefore(now)) continue;
      map.set(p.courseId, (map.get(p.courseId) ?? 0) + p.remainingLessons);
    }
    return map;
  }

  /**
   * 预约入口页:按课种聚合的列表。
   * 排序在服务端完成:已购且有剩余课时的课种置顶,其次已购但课时用完/过期,最后未购买。
   * 每个课种附时段摘要(该课种下所有在开班的班级:周几 + 上午/下午/晚上 + 时间)。
   */
  async parentCourses(parentId: number, studentId: number) {
    await this.assertChildBelongsToParent(parentId, studentId);
    const [courses, classes, packages] = await Promise.all([
      this.courseRepo.find({ where: { status: 'active' }, order: { id: 'ASC' } }),
      this.classRepo.find({ where: { status: 'active' }, relations: { teacher: true } }),
      this.pkgRepo.find({ where: { studentId } }),
    ]);
    const now = dayjs();
    const purchasedCourseIds = new Set(
      packages.filter((p) => p.courseId).map((p) => p.courseId as number),
    );
    const usableByCourse = this.usableRemainingByCourse(packages, now);

    const classesByCourse = new Map<number, ClassEntity[]>();
    for (const cls of classes) {
      const list = classesByCourse.get(cls.courseId) ?? [];
      list.push(cls);
      classesByCourse.set(cls.courseId, list);
    }

    const items = courses.map((course) => {
      const courseClasses = (classesByCourse.get(course.id) ?? []).sort((a, b) =>
        a.weekday !== b.weekday ? a.weekday - b.weekday : a.startTime < b.startTime ? -1 : 1,
      );
      const purchased = purchasedCourseIds.has(course.id);
      const remaining = usableByCourse.get(course.id) ?? 0;
      const bookable = purchased && remaining > 0 && courseClasses.length > 0;
      let reason = '可预约';
      if (!purchased) reason = '未购买该课种,请联系前台报名';
      else if (remaining <= 0) reason = '该课种课时不足,请先续费';
      else if (courseClasses.length === 0) reason = '该课种暂未排课';
      return {
        courseId: course.id,
        courseName: course.name,
        description: course.description,
        purchased,
        remaining,
        bookable,
        reason,
        slots: courseClasses.map((cls) => ({
          classId: cls.id,
          weekday: cls.weekday,
          weekdayText: WEEKDAY_TEXT[cls.weekday - 1],
          period: periodOf(cls.startTime),
          startTime: cls.startTime,
          endTime: cls.endTime,
          teacherName: cls.teacher?.name ?? '',
          room: cls.room,
        })),
      };
    });

    // 已购且可约置顶 → 已购但课时不足 → 未购买;组内按剩余课时多的在前
    const rank = (c: (typeof items)[number]) => (c.bookable ? 0 : c.purchased ? 1 : 2);
    items.sort((a, b) => {
      const r = rank(a) - rank(b);
      if (r !== 0) return r;
      if (b.remaining !== a.remaining) return b.remaining - a.remaining;
      return a.courseId - b.courseId;
    });
    return items;
  }

  /**
   * 某课种的可预约时段(班级模板)+ 每个时段未来 N 天的课次明细。
   * 每节课次带 canBook/reason/余位,供单次多选与长期预约选择。
   */
  async courseSlots(parentId: number, studentId: number, courseId: number, days = 35) {
    await this.assertChildBelongsToParent(parentId, studentId);
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new NotFoundException('课种不存在');

    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(Math.min(Math.max(days, 7), 92), 'day').format('YYYY-MM-DD');
    const lessons = await this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .where('cls.courseId = :cid', { cid: courseId })
      .andWhere("cls.status = 'active'")
      .andWhere('lesson.date BETWEEN :from AND :to', { from, to })
      .andWhere("lesson.status = 'scheduled'")
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.startTime', 'ASC')
      .getMany();

    const [packages, myActive] = await Promise.all([
      this.pkgRepo.find({ where: { studentId } }),
      this.bookingRepo.find({
        where: { studentId, status: In(['booked', 'checked_in']) },
        relations: { lesson: true },
      }),
    ]);
    const now = dayjs();
    const purchased = packages.some((p) => p.courseId === courseId);
    const remaining = this.usableRemainingByCourse(packages, now).get(courseId) ?? 0;
    const bookedLessonIds = new Set(myActive.map((b) => b.lessonId));
    const occupied = myActive
      .filter((b) => b.lesson)
      .map((b) => ({
        date: dayjs(b.lesson.date).format('YYYY-MM-DD'),
        startTime: b.lesson.startTime,
        endTime: b.lesson.endTime,
      }));

    const slotMap = new Map<
      number,
      { classId: number; className: string; weekday: number; weekdayText: string; period: string;
        startTime: string; endTime: string; teacherName: string; room: string; capacity: number;
        lessons: Array<Record<string, unknown>> }
    >();
    for (const lesson of lessons) {
      const cls = lesson.classEntity;
      if (!slotMap.has(cls.id)) {
        slotMap.set(cls.id, {
          classId: cls.id,
          className: cls.name,
          weekday: cls.weekday,
          weekdayText: WEEKDAY_TEXT[cls.weekday - 1],
          period: periodOf(cls.startTime),
          startTime: cls.startTime,
          endTime: cls.endTime,
          teacherName: cls.teacher?.name ?? '',
          room: cls.room,
          capacity: cls.capacity,
          lessons: [],
        });
      }
      const date = dayjs(lesson.date).format('YYYY-MM-DD');
      const bookedCount = (lesson as Lesson & { bookedCount?: number }).bookedCount ?? 0;
      const remainingSeats = Math.max(0, cls.capacity - bookedCount);
      const alreadyBooked = bookedLessonIds.has(lesson.id);
      const started = !dayjs(`${date} ${lesson.startTime}`).isAfter(now);
      const conflict = occupied.some(
        (o) => o.date === date && o.startTime < lesson.endTime && lesson.startTime < o.endTime,
      );
      let canBook = false;
      let reason = '';
      if (alreadyBooked) reason = '已预约';
      else if (started) reason = '已开始';
      else if (remainingSeats <= 0) reason = '名额已满';
      else if (conflict) reason = '时间冲突';
      else if (!purchased) reason = '未购买该课种';
      else if (remaining <= 0) reason = '该课种课时不足';
      else {
        canBook = true;
        reason = '可预约';
      }
      const isoWeekday = dayjs(date).day() === 0 ? 7 : dayjs(date).day();
      slotMap.get(cls.id)!.lessons.push({
        id: lesson.id,
        date,
        weekdayText: WEEKDAY_TEXT[isoWeekday - 1],
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        remainingSeats,
        alreadyBooked,
        canBook,
        reason,
      });
    }
    const slots = [...slotMap.values()].sort((a, b) =>
      a.weekday !== b.weekday ? a.weekday - b.weekday : a.startTime < b.startTime ? -1 : 1,
    );
    return {
      course: { id: course.id, name: course.name, description: course.description },
      purchased,
      remaining,
      slots,
    };
  }

  async parentBook(parentId: number, studentId: number, lessonId: number) {
    await this.assertChildBelongsToParent(parentId, studentId);
    return this.bookings.book({ studentId, lessonId, source: 'parent' });
  }

  /** 批量预约(单次多选 lessonIds / 长期预约 classId+from+to),服务端强校验 */
  async parentBookBatch(
    parentId: number,
    params: { studentId: number; lessonIds?: number[]; classId?: number; from?: string; to?: string },
  ) {
    await this.assertChildBelongsToParent(parentId, params.studentId);
    return this.bookings.bookBatch({ ...params, source: 'parent' });
  }

  async parentCancel(parentId: number, bookingId: number) {
    const links = await this.linkRepo.find({ where: { parentId }, select: { studentId: true } });
    return this.bookings.cancel(bookingId, {
      parentStudentIds: links.map((l) => l.studentId),
    });
  }

  /** 孩子的预约记录 */
  async parentBookings(parentId: number, studentId: number) {
    await this.assertChildBelongsToParent(parentId, studentId);
    const items = await this.bookingRepo.find({
      where: { studentId },
      relations: { lesson: { classEntity: { course: true, teacher: true } }, coursePackage: true },
      order: { id: 'DESC' },
      take: 100,
    });
    return items.map((b) => ({
      id: b.id,
      status: b.status,
      date: dayjs(b.lesson.date).format('YYYY-MM-DD'),
      startTime: b.lesson.startTime,
      endTime: b.lesson.endTime,
      lessonStatus: b.lesson.status,
      className: b.lesson.classEntity.name,
      courseName: b.lesson.classEntity.course.name,
      teacherName: b.lesson.classEntity.teacher.name,
      room: b.lesson.classEntity.room,
      packageName: b.coursePackage?.name ?? null,
      createdAt: b.createdAt,
    }));
  }

  /** 老师:未来/近期课次(含预约人数) */
  async teacherLessons(teacherId: number, days = 14) {
    const teacher = await this.teacherRepo.findOne({ where: { id: teacherId } });
    if (!teacher) throw new NotFoundException('老师不存在');
    const from = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
    const to = dayjs().add(days, 'day').format('YYYY-MM-DD');
    const lessons = await this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .where('cls.teacherId = :tid', { tid: teacherId })
      .andWhere('lesson.date BETWEEN :from AND :to', { from, to })
      .andWhere("lesson.status != 'cancelled'")
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.startTime', 'ASC')
      .getMany();
    return lessons.map((lesson) => ({
      id: lesson.id,
      date: dayjs(lesson.date).format('YYYY-MM-DD'),
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      status: lesson.status,
      className: lesson.classEntity.name,
      courseName: lesson.classEntity.course.name,
      room: lesson.classEntity.room,
      capacity: lesson.classEntity.capacity,
      bookedCount: (lesson as Lesson & { bookedCount?: number }).bookedCount ?? 0,
    }));
  }

  /** 老师:课次预约名单 */
  async teacherRoster(teacherId: number, lessonId: number) {
    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId },
      relations: { classEntity: { course: true, teacher: true } },
    });
    if (!lesson) throw new NotFoundException('课次不存在');
    if (lesson.classEntity.teacherId !== teacherId) {
      throw new ForbiddenException('只能查看自己所教课次的名单');
    }
    const bookings = await this.bookingRepo.find({
      where: { lessonId, status: In(['booked', 'checked_in', 'no_show']) },
      relations: { student: { parentLinks: { parent: true } } },
      order: { id: 'ASC' },
    });
    return {
      lesson: {
        id: lesson.id,
        date: dayjs(lesson.date).format('YYYY-MM-DD'),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        className: lesson.classEntity.name,
        courseName: lesson.classEntity.course.name,
        room: lesson.classEntity.room,
        capacity: lesson.classEntity.capacity,
      },
      students: bookings.map((b) => ({
        bookingId: b.id,
        status: b.status,
        source: b.source,
        studentId: b.studentId,
        name: b.student.name,
        gender: b.student.gender,
        birthday: b.student.birthday,
        parents: b.student.parentLinks.map((l) => ({
          name: l.parent.name,
          phone: l.parent.phone,
          relation: l.relation,
        })),
      })),
    };
  }

  /** 老师在小程序里帮学员签到 */
  async teacherCheckin(teacherId: number, bookingId: number) {
    const booking = await this.bookingRepo.findOne({
      where: { id: bookingId },
      relations: { lesson: { classEntity: true } },
    });
    if (!booking) throw new NotFoundException('预约不存在');
    if (booking.lesson.classEntity.teacherId !== teacherId) {
      throw new ForbiddenException('只能操作自己所教课次');
    }
    return this.bookings.checkin(bookingId);
  }

  /**
   * 临时到课候选学员:购买了本课次课种、且有可用课时(剩余>0、未过期)的在读学员,
   * 排除已在本课次名单中的;按剩余课时降序。
   */
  async teacherWalkinCandidates(teacherId: number, lessonId: number) {
    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId },
      relations: { classEntity: { course: true } },
    });
    if (!lesson) throw new NotFoundException('课次不存在');
    if (lesson.classEntity.teacherId !== teacherId) {
      throw new ForbiddenException('只能操作自己所教课次');
    }
    if (lesson.status !== 'scheduled') throw new BadRequestException('该课次已取消或已结课,不可登记');

    const [packages, bookings] = await Promise.all([
      this.pkgRepo.find({
        where: { courseId: lesson.classEntity.courseId },
        relations: { student: true },
      }),
      this.bookingRepo.find({ where: { lessonId, status: In(['booked', 'checked_in']) } }),
    ]);
    const bookedStudentIds = new Set(bookings.map((b) => b.studentId));
    const now = dayjs();
    const byStudent = new Map<number, { studentId: number; name: string; remaining: number }>();
    for (const p of packages) {
      if (!p.student || p.student.status !== 'active') continue;
      if (p.status !== 'active' || p.remainingLessons <= 0) continue;
      if (p.validUntil && dayjs(p.validUntil).endOf('day').isBefore(now)) continue;
      const cur = byStudent.get(p.studentId) ?? {
        studentId: p.studentId,
        name: p.student.name,
        remaining: 0,
      };
      cur.remaining += p.remainingLessons;
      byStudent.set(p.studentId, cur);
    }
    return {
      lesson: {
        id: lesson.id,
        date: dayjs(lesson.date).format('YYYY-MM-DD'),
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        className: lesson.classEntity.name,
        courseName: lesson.classEntity.course.name,
        room: lesson.classEntity.room,
        capacity: lesson.classEntity.capacity,
      },
      remainingSeats: Math.max(0, lesson.classEntity.capacity - bookings.length),
      students: [...byStudent.values()]
        .filter((s) => !bookedStudentIds.has(s.studentId))
        .sort((a, b) => b.remaining - a.remaining || a.name.localeCompare(b.name, 'zh')),
    };
  }

  /** 临时到课登记:登记即签到并扣 1 课时(与预约同一套规则,允许已开始的课次) */
  async teacherWalkin(teacherId: number, lessonId: number, studentId: number) {
    const lesson = await this.lessonRepo.findOne({
      where: { id: lessonId },
      relations: { classEntity: true },
    });
    if (!lesson) throw new NotFoundException('课次不存在');
    if (lesson.classEntity.teacherId !== teacherId) {
      throw new ForbiddenException('只能操作自己所教课次');
    }
    const booking = await this.bookings.book({
      studentId,
      lessonId,
      source: 'teacher',
      allowStarted: true,
      checkinNow: true,
    });
    const pkg = booking.packageId
      ? await this.pkgRepo.findOne({ where: { id: booking.packageId } })
      : null;
    return {
      bookingId: booking.id,
      studentId,
      deducted: 1,
      packageName: pkg?.name ?? null,
      remainingAfter: pkg?.remainingLessons ?? 0,
    };
  }

  // ==================== 校长端 ====================

  /**
   * 校长工作台总览:经营概况 + 按课种的课时/本月收入统计 + 剩余课时预警。
   * 收入只统计状态为 paid 的流水;本月收入按缴费时间(paidAt)落在当月计。
   */
  async principalOverview() {
    const today = dayjs().format('YYYY-MM-DD');
    const weekEnd = dayjs().add(6, 'day').format('YYYY-MM-DD');
    const todayStart = dayjs().format('YYYY-MM-DD 00:00:00');
    const monthStart = dayjs().startOf('month').format('YYYY-MM-DD 00:00:00');

    const [activeStudents, activeTeachers, todayLessons, weekLessons, activePackages, monthRefund] =
      await Promise.all([
        this.studentRepo.count({ where: { status: 'active' } }),
        this.teacherRepo.count({ where: { status: 'active' } }),
        this.lessonRepo.count({ where: { date: today, status: 'scheduled' } }),
        this.lessonRepo
          .createQueryBuilder('l')
          .where('l.date BETWEEN :from AND :to', { from: today, to: weekEnd })
          .andWhere("l.status = 'scheduled'")
          .getCount(),
        this.pkgRepo.count({ where: { status: 'active' } }),
        this.paymentRepo
          .createQueryBuilder('p')
          .select('COALESCE(SUM(p.amount), 0)', 'sum')
          .where("p.status = 'refunded'")
          .andWhere('p.paidAt >= :monthStart', { monthStart })
          .getRawOne(),
      ]);

    const sumIncome = async (from?: string) => {
      const qb = this.paymentRepo
        .createQueryBuilder('p')
        .select('COALESCE(SUM(p.amount), 0)', 'sum')
        .where("p.status = 'paid'");
      if (from) qb.andWhere('p.paidAt >= :from', { from });
      return Number((await qb.getRawOne())?.sum ?? 0);
    };
    const [todayIncome, monthIncome, totalIncome] = await Promise.all([
      sumIncome(todayStart),
      sumIncome(monthStart),
      sumIncome(),
    ]);

    // 各课种的有效课时包数与剩余课时(不含已过期/用完/退费的包)
    const hourRows = await this.pkgRepo
      .createQueryBuilder('pkg')
      .leftJoin('pkg.course', 'course')
      .select('course.id', 'courseId')
      .addSelect('course.name', 'courseName')
      .addSelect('COUNT(DISTINCT pkg.id)', 'packageCount')
      .addSelect('COALESCE(SUM(pkg.remainingLessons), 0)', 'remainingLessons')
      .where("pkg.status = 'active'")
      .andWhere('pkg.courseId IS NOT NULL')
      .groupBy('course.id')
      .addGroupBy('course.name')
      .getRawMany();

    // 各课种本月收入(按缴费流水所关联课时包的课种归集)
    const incomeRows = await this.paymentRepo
      .createQueryBuilder('p')
      .leftJoin('p.coursePackage', 'pkg')
      .leftJoin('pkg.course', 'course')
      .select('course.id', 'courseId')
      .addSelect('COALESCE(SUM(p.amount), 0)', 'income')
      .where("p.status = 'paid'")
      .andWhere('p.paidAt >= :monthStart', { monthStart })
      .andWhere('pkg.courseId IS NOT NULL')
      .groupBy('course.id')
      .getRawMany();
    const incomeByCourse = new Map<number, number>(
      incomeRows.map((r) => [Number(r.courseId), Number(r.income)]),
    );

    const courses = hourRows
      .map((r) => ({
        courseId: Number(r.courseId),
        courseName: r.courseName,
        packageCount: Number(r.packageCount),
        remainingLessons: Number(r.remainingLessons),
        monthIncome: incomeByCourse.get(Number(r.courseId)) ?? 0,
      }))
      .sort((a, b) => b.monthIncome - a.monthIncome || b.remainingLessons - a.remainingLessons);

    return {
      activeStudents,
      activeTeachers,
      todayLessons,
      weekLessons,
      activePackages,
      todayIncome,
      monthIncome,
      totalIncome,
      monthRefund: Number(monthRefund?.sum ?? 0),
      courses,
      lowHours: await this.lowHoursPackages(),
    };
  }

  /** 校长视角:未来 N 天(含今天)的课次安排,含预约人数/容量 */
  async principalLessons(days = 7) {
    const from = dayjs().format('YYYY-MM-DD');
    const to = dayjs().add(days - 1, 'day').format('YYYY-MM-DD');
    const lessons = await this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .where('lesson.date BETWEEN :from AND :to', { from, to })
      .andWhere("lesson.status = 'scheduled'")
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.startTime', 'ASC')
      .getMany();

    return lessons.map((lesson) => {
      const bookedCount = (lesson as Lesson & { bookedCount?: number }).bookedCount ?? 0;
      const weekday = dayjs(lesson.date).day();
      return {
        id: lesson.id,
        date: dayjs(lesson.date).format('YYYY-MM-DD'),
        weekdayText: WEEKDAY_TEXT[(weekday === 0 ? 7 : weekday) - 1] ?? '',
        startTime: lesson.startTime,
        endTime: lesson.endTime,
        className: lesson.classEntity.name,
        courseName: lesson.classEntity.course.name,
        teacherName: lesson.classEntity.teacher.name,
        room: lesson.classEntity.room,
        capacity: lesson.classEntity.capacity,
        bookedCount,
      };
    });
  }

  /** 校长视角:最近缴费/退费流水(含学员与课种) */
  async principalPayments(limit = 20) {
    const payments = await this.paymentRepo.find({
      relations: { student: true, coursePackage: { course: true } },
      order: { paidAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return payments.map((p) => ({
      id: p.id,
      serialNo: p.serialNo,
      studentName: p.student?.name ?? '',
      courseName: p.coursePackage?.course?.name ?? null,
      packageName: p.coursePackage?.name ?? null,
      amount: Number(p.amount),
      method: p.method,
      methodText: METHOD_TEXT[p.method] ?? p.method,
      status: p.status,
      paidAt: dayjs(p.paidAt).format('YYYY-MM-DD HH:mm'),
      remark: p.remark,
    }));
  }

  /** 剩余课时预警(与后台工作台同一阈值 LOW_HOURS_THRESHOLD) */
  private async lowHoursPackages() {
    const list = await this.pkgRepo
      .createQueryBuilder('pkg')
      .leftJoinAndSelect('pkg.student', 'student')
      .leftJoinAndSelect('pkg.course', 'course')
      .where("pkg.status = 'active'")
      .andWhere('pkg.remainingLessons <= :limit', { limit: LOW_HOURS_LIMIT })
      .orderBy('pkg.remainingLessons', 'ASC')
      .addOrderBy('pkg.id', 'ASC')
      .getMany();
    return list.map((p) => ({
      id: p.id,
      studentName: p.student?.name ?? '',
      courseName: p.course?.name ?? '未绑定课种',
      remainingLessons: p.remainingLessons,
      totalLessons: p.totalLessons,
    }));
  }
}
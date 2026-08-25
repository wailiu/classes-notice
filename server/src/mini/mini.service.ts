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
} from '../entities';
import { BookingsService } from '../bookings/bookings.service';

@Injectable()
export class MiniService {
  constructor(
    @InjectRepository(Parent) private readonly parentRepo: Repository<Parent>,
    @InjectRepository(ParentStudent) private readonly linkRepo: Repository<ParentStudent>,
    @InjectRepository(Teacher) private readonly teacherRepo: Repository<Teacher>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(CoursePackage) private readonly pkgRepo: Repository<CoursePackage>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
    private readonly bookings: BookingsService,
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

  async parentBook(parentId: number, studentId: number, lessonId: number) {
    await this.assertChildBelongsToParent(parentId, studentId);
    return this.bookings.book({ studentId, lessonId, source: 'parent' });
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
}

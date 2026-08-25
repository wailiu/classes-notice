import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, In, Repository } from 'typeorm';
import dayjs from 'dayjs';
import { ClassEntity, Lesson, Course, Teacher, Booking, CoursePackage } from '../entities';

export interface ClassUpsert {
  name: string;
  courseId: number;
  teacherId: number;
  room: string;
  weekday: number;
  startTime: string;
  endTime: string;
  capacity: number;
  status?: string;
}

@Injectable()
export class ClassesService {
  constructor(
    @InjectRepository(ClassEntity) private readonly repo: Repository<ClassEntity>,
    @InjectRepository(Lesson) private readonly lessonRepo: Repository<Lesson>,
    @InjectRepository(Course) private readonly courseRepo: Repository<Course>,
    @InjectRepository(Teacher) private readonly teacherRepo: Repository<Teacher>,
    @InjectRepository(Booking) private readonly bookingRepo: Repository<Booking>,
  ) {}

  async list(query: { courseId?: number; teacherId?: number; status?: string }) {
    const where: Record<string, unknown> = {};
    if (query.courseId) where.courseId = Number(query.courseId);
    if (query.teacherId) where.teacherId = Number(query.teacherId);
    if (query.status) where.status = query.status;
    return this.repo.find({
      where,
      relations: { course: true, teacher: true },
      order: { weekday: 'ASC', startTime: 'ASC' },
    });
  }

  async create(data: ClassUpsert) {
    await this.validateRefs(data.courseId, data.teacherId);
    this.validateTime(data.startTime, data.endTime);
    return this.repo.save(this.repo.create({ ...data, status: data.status ?? 'active' }));
  }

  async update(id: number, data: Partial<ClassUpsert>) {
    const cls = await this.repo.findOne({ where: { id } });
    if (!cls) throw new NotFoundException('班级不存在');
    if (data.courseId || data.teacherId) {
      await this.validateRefs(data.courseId ?? cls.courseId, data.teacherId ?? cls.teacherId);
    }
    this.validateTime(data.startTime ?? cls.startTime, data.endTime ?? cls.endTime);
    Object.assign(cls, data);
    return this.repo.save(cls);
  }

  async remove(id: number) {
    const lessonIds = (await this.lessonRepo.find({ where: { classId: id }, select: { id: true } })).map(
      (l) => l.id,
    );
    if (lessonIds.length) {
      const count = await this.bookingRepo.count({
        where: { lessonId: In(lessonIds), status: In(['booked', 'checked_in']) },
      });
      if (count > 0) throw new BadRequestException('该班级课次存在有效预约,无法删除,可改为停用');
    }
    await this.repo.delete(id);
    return { success: true };
  }

  /** 按班级每周排课模板,在 [from, to] 日期范围内生成课次(已存在的日期跳过) */
  async generateLessons(classId: number, from: string, to: string) {
    const cls = await this.repo.findOne({ where: { id: classId } });
    if (!cls) throw new NotFoundException('班级不存在');
    const start = dayjs(from);
    const end = dayjs(to);
    if (!start.isValid() || !end.isValid() || end.isBefore(start)) {
      throw new BadRequestException('日期范围不合法');
    }
    if (end.diff(start, 'day') > 200) throw new BadRequestException('单次最多生成 200 天范围');

    const existing = await this.lessonRepo.find({
      where: { classId, date: Between(start.format('YYYY-MM-DD'), end.format('YYYY-MM-DD')) },
      select: { date: true },
    });
    const existingDates = new Set(existing.map((l) => dayjs(l.date).format('YYYY-MM-DD')));

    const toCreate: Lesson[] = [];
    for (let d = start; !d.isAfter(end); d = d.add(1, 'day')) {
      // dayjs: 0=周日...6=周六 -> 转换为 1=周一...7=周日
      const isoWeekday = d.day() === 0 ? 7 : d.day();
      const dateStr = d.format('YYYY-MM-DD');
      if (isoWeekday === cls.weekday && !existingDates.has(dateStr)) {
        toCreate.push(
          this.lessonRepo.create({
            classId,
            date: dateStr,
            startTime: cls.startTime,
            endTime: cls.endTime,
            status: 'scheduled',
          }),
        );
      }
    }
    const saved = await this.lessonRepo.save(toCreate);
    return { created: saved.length, skipped: existingDates.size };
  }

  /** 课次列表(课表),支持按日期范围/班级/老师过滤,附带预约人数 */
  async listLessons(query: {
    from?: string;
    to?: string;
    classId?: number;
    teacherId?: number;
    status?: string;
  }) {
    const qb = this.lessonRepo
      .createQueryBuilder('lesson')
      .leftJoinAndSelect('lesson.classEntity', 'cls')
      .leftJoinAndSelect('cls.course', 'course')
      .leftJoinAndSelect('cls.teacher', 'teacher')
      .loadRelationCountAndMap('lesson.bookedCount', 'lesson.bookings', 'b', (sub) =>
        sub.andWhere("b.status IN ('booked','checked_in')"),
      )
      .orderBy('lesson.date', 'ASC')
      .addOrderBy('lesson.startTime', 'ASC');
    if (query.from) qb.andWhere('lesson.date >= :from', { from: query.from });
    if (query.to) qb.andWhere('lesson.date <= :to', { to: query.to });
    if (query.classId) qb.andWhere('lesson.classId = :classId', { classId: Number(query.classId) });
    if (query.teacherId) qb.andWhere('cls.teacherId = :teacherId', { teacherId: Number(query.teacherId) });
    if (query.status) qb.andWhere('lesson.status = :status', { status: query.status });
    return qb.getMany();
  }

  /** 取消课次:退回所有有效预约的课时 */
  async cancelLesson(lessonId: number) {
    const lesson = await this.lessonRepo.findOne({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('课次不存在');
    if (lesson.status === 'cancelled') throw new BadRequestException('课次已取消');

    await this.lessonRepo.manager.transaction(async (em) => {
      const bookings = await em.find(Booking, {
        where: { lessonId, status: 'booked' },
      });
      for (const booking of bookings) {
        booking.status = 'cancelled';
        booking.cancelledAt = new Date();
        await em.save(booking);
        if (booking.packageId) {
          await em.increment(CoursePackage, { id: booking.packageId }, 'remainingLessons', 1);
        }
      }
      lesson.status = 'cancelled';
      await em.save(lesson);
    });
    return { success: true };
  }

  private async validateRefs(courseId: number, teacherId: number) {
    const course = await this.courseRepo.findOne({ where: { id: courseId } });
    if (!course) throw new BadRequestException('科目不存在');
    const teacher = await this.teacherRepo.findOne({ where: { id: teacherId } });
    if (!teacher) throw new BadRequestException('老师不存在');
  }

  private validateTime(startTime: string, endTime: string) {
    if (startTime >= endTime) throw new BadRequestException('结束时间必须晚于开始时间');
  }
}

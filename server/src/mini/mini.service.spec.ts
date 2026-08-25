import dayjs from 'dayjs';
import { MiniService } from './mini.service';

/**
 * 小程序可约课表标记规则单测(内存 mock,不依赖 MySQL):
 * 课表展示全部课种,但每个课次带 canBook + reason,
 * 未购买课种 / 该课种课时不足 / 已满 / 已约 都必须 canBook=false。
 */
describe('MiniService.availableLessons 课种可约标记', () => {
  const D1 = dayjs().add(1, 'day').format('YYYY-MM-DD');

  const makeLesson = (
    id: number,
    courseId: number,
    courseName: string,
    opts: { capacity?: number; bookedCount?: number } = {},
  ) => ({
    id,
    date: D1,
    startTime: '10:00',
    endTime: '11:00',
    status: 'scheduled',
    bookedCount: opts.bookedCount ?? 0,
    classEntity: {
      id,
      name: `${courseName}班`,
      room: '101',
      capacity: opts.capacity ?? 8,
      courseId,
      course: { id: courseId, name: courseName },
      teacher: { name: '王老师' },
    },
  });

  // 课种:10 素描(有余课时)、20 钢琴(未购买)、30 书法(买过但用完)
  let lessons: any[];
  let myBookings: any[];
  let studentPackages: any[];
  let service: MiniService;

  beforeEach(() => {
    lessons = [
      makeLesson(1, 10, '素描'),
      makeLesson(2, 20, '钢琴'),
      makeLesson(3, 30, '书法'),
      makeLesson(4, 10, '素描', { capacity: 2, bookedCount: 2 }),
      makeLesson(5, 10, '素描'),
    ];
    myBookings = [{ lessonId: 5 }];
    studentPackages = [
      { id: 1, studentId: 7, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null },
      { id: 2, studentId: 7, courseId: 30, remainingLessons: 0, status: 'finished', validUntil: null },
      // 历史通用包:未绑定课种,不应让任何课种变为可约
      { id: 3, studentId: 7, courseId: null, remainingLessons: 9, status: 'active', validUntil: null },
    ];

    const qb: any = {
      leftJoinAndSelect: () => qb,
      loadRelationCountAndMap: () => qb,
      where: () => qb,
      andWhere: () => qb,
      orderBy: () => qb,
      addOrderBy: () => qb,
      getMany: async () => lessons,
    };
    const linkRepo: any = { findOne: async () => ({ parentId: 1, studentId: 7 }) };
    const lessonRepo: any = { createQueryBuilder: () => qb };
    const bookingRepo: any = { find: async () => myBookings };
    const pkgRepo: any = { find: async () => studentPackages };
    service = new MiniService(
      {} as any,
      linkRepo,
      {} as any,
      lessonRepo,
      pkgRepo,
      bookingRepo,
      {} as any,
    );
  });

  it('已购课种且有余课时:canBook=true', async () => {
    const list = await service.availableLessons(1, 7);
    const sketch = list.find((l) => l.id === 1)!;
    expect(sketch.canBook).toBe(true);
    expect(sketch.reason).toBe('可预约');
    expect(sketch.courseRemaining).toBe(5);
  });

  it('未购买该课种:canBook=false,原因"未购买该课种"', async () => {
    const list = await service.availableLessons(1, 7);
    const piano = list.find((l) => l.id === 2)!;
    expect(piano.canBook).toBe(false);
    expect(piano.reason).toBe('未购买该课种');
  });

  it('买过该课种但课时用完:canBook=false,原因"该课种课时不足"', async () => {
    const list = await service.availableLessons(1, 7);
    const calligraphy = list.find((l) => l.id === 3)!;
    expect(calligraphy.canBook).toBe(false);
    expect(calligraphy.reason).toBe('该课种课时不足');
  });

  it('名额已满优先于课时判断:canBook=false,原因"名额已满"', async () => {
    const list = await service.availableLessons(1, 7);
    const full = list.find((l) => l.id === 4)!;
    expect(full.canBook).toBe(false);
    expect(full.reason).toBe('名额已满');
  });

  it('已预约的课次:canBook=false,原因"已预约"', async () => {
    const list = await service.availableLessons(1, 7);
    const booked = list.find((l) => l.id === 5)!;
    expect(booked.canBook).toBe(false);
    expect(booked.reason).toBe('已预约');
  });

  it('通用包(未绑定课种)不改变任何课种的可约性', async () => {
    // 即使通用包剩余 9 课时,钢琴仍是"未购买该课种"
    const list = await service.availableLessons(1, 7);
    expect(list.find((l) => l.id === 2)!.canBook).toBe(false);
  });

  it('课表仍返回全部课种(未购课种也展示,只是不可约)', async () => {
    const list = await service.availableLessons(1, 7);
    expect(list).toHaveLength(5);
    expect(new Set(list.map((l) => l.courseName))).toEqual(new Set(['素描', '钢琴', '书法']));
  });
});

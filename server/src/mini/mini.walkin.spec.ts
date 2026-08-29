import { ForbiddenException } from '@nestjs/common';
import dayjs from 'dayjs';
import { MiniService } from './mini.service';

/**
 * 老师端临时到课单测(内存 mock,不依赖 MySQL):
 * 候选学员筛选(已购本课种 + 有可用课时 + 在读 + 未在名单中)与老师权限校验。
 */
describe('MiniService 老师临时到课', () => {
  const D1 = dayjs().format('YYYY-MM-DD');

  const lesson = {
    id: 100,
    date: D1,
    startTime: '10:00',
    endTime: '11:30',
    status: 'scheduled',
    classEntity: {
      id: 1,
      name: '素描·周六上午班',
      room: '101 画室',
      capacity: 8,
      teacherId: 1,
      courseId: 10,
      course: { name: '素描' },
    },
  };

  let service: MiniService;
  let packages: any[];

  beforeEach(() => {
    packages = [
      // 张小明:素描 5 课时,但已在名单中 → 不出现在候选里
      { studentId: 1, courseId: 10, remainingLessons: 5, status: 'active', validUntil: null, student: { name: '张小明', status: 'active' } },
      // 孙小果:素描 18 课时 → 候选
      { studentId: 7, courseId: 10, remainingLessons: 18, status: 'active', validUntil: null, student: { name: '孙小果', status: 'active' } },
      // 钱用完:包 finished → 排除
      { studentId: 5, courseId: 10, remainingLessons: 0, status: 'finished', validUntil: null, student: { name: '钱用完', status: 'active' } },
      // 孙过期:包过期 → 排除
      { studentId: 6, courseId: 10, remainingLessons: 6, status: 'active', validUntil: '2020-01-01', student: { name: '孙过期', status: 'active' } },
      // 停课学员 → 排除
      { studentId: 8, courseId: 10, remainingLessons: 9, status: 'active', validUntil: null, student: { name: '郑星辰', status: 'inactive' } },
      // 其他课种的包不该被查出来(查询层按 courseId 过滤,mock 同样只按 courseId 返回)
    ];

    const lessonRepo: any = {
      findOne: async ({ where }: any) => (where.id === 100 ? lesson : null),
    };
    const pkgRepo: any = {
      find: async ({ where }: any) => packages.filter((p) => p.courseId === where.courseId),
      findOne: async () => null,
    };
    const bookingRepo: any = {
      find: async () => [{ studentId: 1, status: 'booked' }],
    };

    service = new MiniService(
      {} as any,
      {} as any,
      {} as any,
      lessonRepo,
      pkgRepo,
      bookingRepo,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
  });

  it('候选学员只含"已购本课种 + 有可用课时 + 在读 + 未在名单中"', async () => {
    const res = await service.teacherWalkinCandidates(1, 100);
    expect(res.remainingSeats).toBe(7);
    expect(res.students).toEqual([
      { studentId: 7, name: '孙小果', remaining: 18 },
    ]);
    expect(res.lesson).toEqual(
      expect.objectContaining({ courseName: '素描', className: '素描·周六上午班', capacity: 8 }),
    );
  });

  it('只能操作自己所教课次', async () => {
    await expect(service.teacherWalkinCandidates(2, 100)).rejects.toThrow(ForbiddenException);
    await expect(service.teacherWalkin(2, 100, 7)).rejects.toThrow(ForbiddenException);
  });
});

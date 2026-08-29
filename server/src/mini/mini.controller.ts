import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { IsArray, IsInt, IsOptional, Matches } from 'class-validator';import { CurrentUser, MiniGuard, MiniJwtPayload, Roles } from '../auth/guards';
import { MiniService } from './mini.service';

class ParentBookDto {
  @IsInt()
  studentId: number;

  @IsInt()
  lessonId: number;
}

class ParentBatchBookDto {
  @IsInt()
  studentId: number;

  /** 单次多选:勾选的课次 id 列表 */
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  lessonIds?: number[];

  /** 长期预约:班级(时段)+ 日期范围 */
  @IsOptional()
  @IsInt()
  classId?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from 格式应为 YYYY-MM-DD' })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to 格式应为 YYYY-MM-DD' })
  to?: string;
}

/** 老师登记临时到课 */
class TeacherWalkinDto {
  @IsInt()
  studentId: number;
}

@UseGuards(MiniGuard)
@Controller('mini')
export class MiniController {
  constructor(private readonly service: MiniService) {}

  @Get('me')
  me(@CurrentUser() user: MiniJwtPayload) {
    return {
      role: user.role,
      parentId: user.parentId ?? null,
      teacherId: user.teacherId ?? null,
      adminUserId: user.adminUserId ?? null,
    };
  }

  // ---------- 家长端 ----------

  @Roles('parent')
  @Get('parent/children')
  children(@CurrentUser() user: MiniJwtPayload) {
    return this.service.parentChildren(user.parentId!);
  }

  @Roles('parent')
  @Get('parent/lessons')
  availableLessons(
    @CurrentUser() user: MiniJwtPayload,
    @Query('studentId', ParseIntPipe) studentId: number,
    @Query('days') days?: number,
  ) {
    return this.service.availableLessons(user.parentId!, studentId, days ? Number(days) : 14);
  }

  /** 预约入口:按课种聚合的列表(服务端已按"已购置顶"排序) */
  @Roles('parent')
  @Get('parent/courses')
  courses(
    @CurrentUser() user: MiniJwtPayload,
    @Query('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.service.parentCourses(user.parentId!, studentId);
  }

  /** 某课种的时段(班级)+ 每时段未来课次(含 canBook/reason/余位) */
  @Roles('parent')
  @Get('parent/courses/:courseId/slots')
  courseSlots(
    @CurrentUser() user: MiniJwtPayload,
    @Param('courseId', ParseIntPipe) courseId: number,
    @Query('studentId', ParseIntPipe) studentId: number,
    @Query('days') days?: number,
  ) {
    return this.service.courseSlots(user.parentId!, studentId, courseId, days ? Number(days) : 35);
  }

  /** 批量预约:单次多选(lessonIds)或长期预约(classId+from+to) */
  @Roles('parent')
  @Post('parent/bookings/batch')
  bookBatch(@CurrentUser() user: MiniJwtPayload, @Body() dto: ParentBatchBookDto) {
    return this.service.parentBookBatch(user.parentId!, dto);
  }

  @Roles('parent')
  @Post('parent/bookings')
  book(@CurrentUser() user: MiniJwtPayload, @Body() dto: ParentBookDto) {
    return this.service.parentBook(user.parentId!, dto.studentId, dto.lessonId);
  }

  @Roles('parent')
  @Get('parent/bookings')
  bookings(
    @CurrentUser() user: MiniJwtPayload,
    @Query('studentId', ParseIntPipe) studentId: number,
  ) {
    return this.service.parentBookings(user.parentId!, studentId);
  }

  @Roles('parent')
  @Post('parent/bookings/:id/cancel')
  cancel(@CurrentUser() user: MiniJwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.parentCancel(user.parentId!, id);
  }

  // ---------- 老师端 ----------

  @Roles('teacher')
  @Get('teacher/lessons')
  teacherLessons(@CurrentUser() user: MiniJwtPayload, @Query('days') days?: number) {
    return this.service.teacherLessons(user.teacherId!, days ? Number(days) : 14);
  }

  @Roles('teacher')
  @Get('teacher/lessons/:id/roster')
  roster(@CurrentUser() user: MiniJwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.teacherRoster(user.teacherId!, id);
  }

  @Roles('teacher')
  @Post('teacher/bookings/:id/checkin')
  checkin(@CurrentUser() user: MiniJwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.teacherCheckin(user.teacherId!, id);
  }

  /** 临时到课候选学员:已购本课次课种且有可用课时的在读学员 */
  @Roles('teacher')
  @Get('teacher/lessons/:id/walkin-candidates')
  walkinCandidates(@CurrentUser() user: MiniJwtPayload, @Param('id', ParseIntPipe) id: number) {
    return this.service.teacherWalkinCandidates(user.teacherId!, id);
  }

  /** 临时到课登记:登记即签到并扣 1 课时 */
  @Roles('teacher')
  @Post('teacher/lessons/:id/walkin')
  walkin(
    @CurrentUser() user: MiniJwtPayload,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: TeacherWalkinDto,
  ) {
    return this.service.teacherWalkin(user.teacherId!, id, dto.studentId);
  }

  // ---------- 校长端 ----------

  /** 工作台总览:经营概况 + 按课种课时/收入 + 剩余课时预警 */
  @Roles('principal')
  @Get('principal/overview')
  principalOverview() {
    return this.service.principalOverview();
  }

  /** 未来 N 天课次安排(默认 7 天,含预约人数/容量) */
  @Roles('principal')
  @Get('principal/lessons')
  principalLessons(@Query('days') days?: number) {
    return this.service.principalLessons(days ? Number(days) : 7);
  }

  /** 最近缴费/退费流水(默认 20 条) */
  @Roles('principal')
  @Get('principal/payments')
  principalPayments(@Query('limit') limit?: number) {
    return this.service.principalPayments(limit ? Number(limit) : 20);
  }
}

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
import { IsArray, IsInt, IsOptional, Matches } from 'class-validator';
import { CurrentUser, MiniGuard, MiniJwtPayload, Roles } from '../auth/guards';
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

@UseGuards(MiniGuard)
@Controller('mini')
export class MiniController {
  constructor(private readonly service: MiniService) {}

  @Get('me')
  me(@CurrentUser() user: MiniJwtPayload) {
    return { role: user.role, parentId: user.parentId ?? null, teacherId: user.teacherId ?? null };
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
}

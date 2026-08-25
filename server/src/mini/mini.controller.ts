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
import { IsInt } from 'class-validator';
import { CurrentUser, MiniGuard, MiniJwtPayload, Roles } from '../auth/guards';
import { MiniService } from './mini.service';

class ParentBookDto {
  @IsInt()
  studentId: number;

  @IsInt()
  lessonId: number;
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

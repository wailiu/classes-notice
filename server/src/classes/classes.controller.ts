import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { ClassesService } from './classes.service';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

class ClassDto {
  @IsString()
  @IsNotEmpty({ message: '班级名称不能为空' })
  @MaxLength(100)
  name: string;

  @IsInt()
  courseId: number;

  @IsInt()
  teacherId: number;

  @IsString()
  @IsNotEmpty({ message: '教室不能为空' })
  @MaxLength(50)
  room: string;

  @IsInt()
  @Min(1)
  @Max(7)
  weekday: number;

  @Matches(TIME_RE, { message: '开始时间格式应为 HH:mm' })
  startTime: string;

  @Matches(TIME_RE, { message: '结束时间格式应为 HH:mm' })
  endTime: string;

  @IsInt()
  @Min(1)
  @Max(200)
  capacity: number;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: string;
}

class GenerateLessonsDto {
  @IsString()
  @IsNotEmpty({ message: '开始日期不能为空' })
  from: string;

  @IsString()
  @IsNotEmpty({ message: '结束日期不能为空' })
  to: string;
}

@UseGuards(AdminGuard)
@Controller()
export class ClassesController {
  constructor(private readonly service: ClassesService) {}

  @Get('classes')
  list(@Query() query: { courseId?: number; teacherId?: number; status?: string }) {
    return this.service.list(query);
  }

  @Post('classes')
  create(@Body() dto: ClassDto) {
    return this.service.create(dto);
  }

  @Put('classes/:id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: ClassDto) {
    return this.service.update(id, dto);
  }

  @Delete('classes/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Post('classes/:id/generate-lessons')
  generateLessons(@Param('id', ParseIntPipe) id: number, @Body() dto: GenerateLessonsDto) {
    return this.service.generateLessons(id, dto.from, dto.to);
  }

  @Get('lessons')
  listLessons(
    @Query()
    query: {
      from?: string;
      to?: string;
      classId?: number;
      teacherId?: number;
      status?: string;
    },
  ) {
    return this.service.listLessons(query);
  }

  @Post('lessons/:id/cancel')
  cancelLesson(@Param('id', ParseIntPipe) id: number) {
    return this.service.cancelLesson(id);
  }
}

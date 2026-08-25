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
import { IsInt, IsOptional } from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { BookingsService } from './bookings.service';

class BookDto {
  @IsInt()
  studentId: number;

  @IsInt()
  lessonId: number;

  @IsOptional()
  @IsInt()
  packageId?: number;
}

@UseGuards(AdminGuard)
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Get()
  list(
    @Query()
    query: {
      lessonId?: number;
      studentId?: number;
      status?: string;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.service.list(query);
  }

  @Post()
  book(@Body() dto: BookDto) {
    return this.service.book({ ...dto, source: 'admin' });
  }

  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number) {
    // 后台取消不受"开课前 N 小时"限制
    return this.service.cancel(id, { force: true });
  }

  @Post(':id/checkin')
  checkin(@Param('id', ParseIntPipe) id: number) {
    return this.service.checkin(id);
  }

  @Post(':id/no-show')
  noShow(@Param('id', ParseIntPipe) id: number) {
    return this.service.markNoShow(id);
  }
}

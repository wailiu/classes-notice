import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards';
import { DashboardService } from './dashboard.service';

@UseGuards(AdminGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  @Get('summary')
  summary() {
    return this.service.summary();
  }

  @Get('today-lessons')
  todayLessons() {
    return this.service.todayLessons();
  }

  @Get('low-hours')
  lowHours(@Query('threshold') threshold?: number) {
    return this.service.lowHours(threshold ? Number(threshold) : undefined);
  }
}

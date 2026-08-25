import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Student, Teacher, Lesson, CoursePackage, Payment, Booking } from '../entities';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Student, Teacher, Lesson, CoursePackage, Payment, Booking])],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}

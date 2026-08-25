import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Parent,
  ParentStudent,
  Student,
  Teacher,
  Course,
  ClassEntity,
  Lesson,
  CoursePackage,
  Booking,
} from '../entities';
import { BookingsModule } from '../bookings/bookings.module';
import { MiniService } from './mini.service';
import { MiniController } from './mini.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Parent,
      ParentStudent,
      Student,
      Teacher,
      Course,
      ClassEntity,
      Lesson,
      CoursePackage,
      Booking,
    ]),
    BookingsModule,
  ],
  controllers: [MiniController],
  providers: [MiniService],
})
export class MiniModule {}

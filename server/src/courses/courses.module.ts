import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Course, ClassEntity } from '../entities';
import { CoursesService } from './courses.service';
import { CoursesController } from './courses.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Course, ClassEntity])],
  controllers: [CoursesController],
  providers: [CoursesService],
})
export class CoursesModule {}

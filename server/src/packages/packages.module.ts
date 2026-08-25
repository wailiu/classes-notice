import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursePackage, Student, Course, Payment, Booking } from '../entities';
import { PackagesService } from './packages.service';
import { PackagesController } from './packages.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CoursePackage, Student, Course, Payment, Booking])],
  controllers: [PackagesController],
  providers: [PackagesService],
  exports: [PackagesService],
})
export class PackagesModule {}

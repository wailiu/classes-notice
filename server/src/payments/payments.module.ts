import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment, Student, CoursePackage } from '../entities';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Student, CoursePackage])],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}

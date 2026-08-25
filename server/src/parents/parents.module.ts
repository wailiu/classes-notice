import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Parent, ParentStudent, Student } from '../entities';
import { ParentsService } from './parents.service';
import { ParentsController } from './parents.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Parent, ParentStudent, Student])],
  controllers: [ParentsController],
  providers: [ParentsService],
})
export class ParentsModule {}

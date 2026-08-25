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
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { StudentsService } from './students.service';

class StudentDto {
  @IsString()
  @IsNotEmpty({ message: '姓名不能为空' })
  @MaxLength(50)
  name: string;

  @IsOptional()
  @IsIn(['male', 'female', 'unknown'])
  gender?: string;

  @IsOptional()
  @IsString()
  birthday?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

class ParentLinkDto {
  @IsInt()
  parentId: number;

  @IsString()
  @IsNotEmpty()
  relation: string;
}

class SetParentsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ParentLinkDto)
  links: ParentLinkDto[];
}

@UseGuards(AdminGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get()
  list(@Query() query: { keyword?: string; status?: string; page?: number; pageSize?: number }) {
    return this.service.list(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Post()
  create(@Body() dto: StudentDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: StudentDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  @Put(':id/parents')
  setParents(@Param('id', ParseIntPipe) id: number, @Body() dto: SetParentsDto) {
    return this.service.setParents(id, dto.links);
  }
}

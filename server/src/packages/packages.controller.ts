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
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { AdminGuard } from '../auth/guards';
import { PackagesService } from './packages.service';

class PackagePaymentDto {
  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(['wechat', 'alipay', 'cash', 'card', 'other'])
  method: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

class PackageCreateDto {
  @IsInt()
  studentId: number;

  /** 课时按课种消耗,新建课时包必须绑定课种(不再支持通用包) */
  @IsInt({ message: '请选择课时包绑定的课种' })
  courseId: number;

  @IsString()
  @IsNotEmpty({ message: '课时包名称不能为空' })
  @MaxLength(100)
  name: string;

  @IsInt()
  @Min(1)
  totalLessons: number;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PackagePaymentDto)
  payment?: PackagePaymentDto;
}

class PackageUpdateDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  validUntil?: string;

  @IsOptional()
  @IsIn(['active', 'expired', 'finished', 'refunded'])
  status?: string;
}

class AdjustDto {
  @IsInt()
  delta: number;
}

@UseGuards(AdminGuard)
@Controller('packages')
export class PackagesController {
  constructor(private readonly service: PackagesService) {}

  @Get()
  list(
    @Query()
    query: {
      studentId?: number;
      status?: string;
      lowRemaining?: number;
      page?: number;
      pageSize?: number;
    },
  ) {
    return this.service.list(query);
  }

  @Post()
  create(@Body() dto: PackageCreateDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: PackageUpdateDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/adjust')
  adjust(@Param('id', ParseIntPipe) id: number, @Body() dto: AdjustDto) {
    return this.service.adjust(id, dto.delta);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}

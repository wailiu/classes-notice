import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { ALL_ENTITIES } from './entities';
import { AuthModule } from './auth/auth.module';
import { StudentsModule } from './students/students.module';
import { ParentsModule } from './parents/parents.module';
import { TeachersModule } from './teachers/teachers.module';
import { CoursesModule } from './courses/courses.module';
import { ClassesModule } from './classes/classes.module';
import { PackagesModule } from './packages/packages.module';
import { PaymentsModule } from './payments/payments.module';
import { BookingsModule } from './bookings/bookings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { MiniModule } from './mini/mini.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env', '../.env'] }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST', '127.0.0.1'),
        port: Number(config.get('DB_PORT', 3306)),
        username: config.get('DB_USER', 'art'),
        password: config.get('DB_PASSWORD', 'art123456'),
        database: config.get('DB_NAME', 'art_school'),
        entities: ALL_ENTITIES,
        charset: 'utf8mb4',
        // 演示项目使用 synchronize 自动建表;生产环境建议改为 migration
        synchronize: config.get('DB_SYNC', 'true') === 'true',
        timezone: '+08:00',
        // DATE 列按字符串返回,避免 JSON 序列化时出现时区偏移(生日提前一天等问题)
        extra: { dateStrings: ['DATE'] },
      }),
    }),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'art-school-dev-secret',
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as `${number}d` },
    }),
    AuthModule,
    StudentsModule,
    ParentsModule,
    TeachersModule,
    CoursesModule,
    ClassesModule,
    PackagesModule,
    PaymentsModule,
    BookingsModule,
    DashboardModule,
    MiniModule,
  ],
})
export class AppModule {}

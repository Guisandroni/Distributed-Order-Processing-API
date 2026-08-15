import { JwtModule } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';

@Module({
  imports: [
    UsersModule,

    JwtModule.registerAsync({
      global: true,
      imports: [ConfigModule],
      inject: [ConfigService],

      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),

        signOptions: {
          expiresIn: '15m',
        },
      }),
    }),
  ],

  controllers: [AuthController],

  providers: [AuthService, AuthGuard],

  exports: [AuthService],
})
export class AuthModule {}

import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthUserService } from './auth-user.service';
import { EmailService } from './email.service';
import { CustomizationService } from './customization.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user';
import { S3Module } from '../s3/s3.module';
import { ProfileService } from './profile.service';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET') || 'your-secret-key',
        signOptions: { 
          expiresIn: '30d' // Token expires in 30 days
        },
      }),
      inject: [ConfigService],
    }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
    ]),
    S3Module,
    FirebaseModule
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthUserService, EmailService, CustomizationService, JwtStrategy, ProfileService],
  exports: [AuthService],
})
export class AuthModule {}

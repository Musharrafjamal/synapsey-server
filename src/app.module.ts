import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { S3Module } from './s3/s3.module';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AiListenerModule } from './ai-listener/ai-listener.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true
    }),
    S3Module,
    MongooseModule.forRoot(process.env.MONGO_URI),
    AuthModule,
    FirebaseModule,
    AiListenerModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
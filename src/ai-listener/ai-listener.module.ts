import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AiListenerService } from './ai-listener.service';
import { ChatService } from './chat.service';
import { AiListenerController } from './ai-listener.controller';
import { AiListenerChat, ChatSchema } from '../schemas/ai-listener/chat';
import {
  AiListenerMessage,
  MessageSchema,
} from '../schemas/ai-listener/message';
import { User, UserSchema } from '../schemas/user';
import { S3Module } from '../s3/s3.module';
import { VisionModule } from '../vision/vision.module';

import { QuestionGeneratorService } from './question-generator.service';

@Module({
  imports: [
    ConfigModule,
    S3Module,
    VisionModule,
    MongooseModule.forFeature([
      { name: AiListenerChat.name, schema: ChatSchema },
      { name: AiListenerMessage.name, schema: MessageSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [AiListenerController],
  providers: [AiListenerService, ChatService, QuestionGeneratorService],
  exports: [AiListenerService, ChatService, QuestionGeneratorService],
})
export class AiListenerModule {}

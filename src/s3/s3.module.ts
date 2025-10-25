import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { S3Service } from './s3.service';
import { S3Controller } from './s3.controller';
import { ImageService } from './image.service';
import { Image, ImageSchema } from '../schemas/image';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: Image.name, schema: ImageSchema }
    ])
  ],
  controllers: [S3Controller],
  providers: [S3Service, ImageService],
  exports: [S3Service, ImageService],
})
export class S3Module {}
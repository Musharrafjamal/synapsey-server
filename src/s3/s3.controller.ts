import {
  Controller,
  Post,
  Delete,
  UseInterceptors,
  UploadedFile,
  Query,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { S3Service } from './s3.service';
import { ImageService } from './image.service';
import { UploadUtils, UploadOptions } from './upload.utils';

@Controller('s3')
export class S3Controller {
  constructor(
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', UploadUtils.getMulterConfig()))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder?: string,
    @Query('imageType') imageType?: string,
    @Query('uploadedBy') uploadedBy?: string,
  ) {
    const options: UploadOptions = {
      folder,
      imageType: imageType as any,
      uploadedBy,
    };

    return await UploadUtils.uploadFile(file, this.s3Service, this.imageService, options);
  }

  @Delete('delete')
  async deleteFile(@Body('url') url: string) {
    if (!url) {
      throw new BadRequestException('File key is required');
    }

    try {
      const image = await this.imageService.findImageByUrl(url);
      if (!image) {
        throw new BadRequestException('Image not found');
      }

      const fileKey = image.key;

      // Delete from S3
      const s3Success = await this.s3Service.deleteFile(fileKey);
      
      // Delete from database
      const dbSuccess = await this.imageService.deleteImageByKey(fileKey);
      
      return {
        success: s3Success && dbSuccess,
        message: s3Success && dbSuccess 
          ? 'File deleted successfully from S3 and database' 
          : 'Failed to delete file completely',
        s3Deleted: s3Success,
        dbDeleted: dbSuccess,
      };
    } catch (error) {
      console.error('Delete error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to delete file: ${errorMessage}`);
    }
  }
}
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

@Injectable()
export class S3Service {
  private s3Client: S3Client;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS credentials not found in environment variables');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async uploadFile(file: Express.Multer.File, folder?: string): Promise<{ url: string; key: string }> {
    // Clean and normalize the folder path
    let normalizedFolder = '';
    if (folder) {
      // Remove leading/trailing slashes and normalize path
      normalizedFolder = folder
        .split('/')
        .filter(Boolean)
        .join('/');
      
      if (normalizedFolder) {
        normalizedFolder += '/';
      }
    }

    // Replace spaces with underscores in the original filename
    const sanitizedOriginalName = file.originalname.replace(/\s+/g, '_');
    const fileName = `${normalizedFolder}${Date.now()}-${sanitizedOriginalName}`;
    
    const command = new PutObjectCommand({
      Bucket: this.configService.get<string>('AWS_BUCKET_NAME'),
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype,
    });

    await this.s3Client.send(command);

    // Generate a public URL that doesn't expire
    const bucketName = this.configService.get<string>('AWS_BUCKET_NAME');
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    
    // Construct the public URL
    const publicUrl = `https://${bucketName}.s3.${region}.amazonaws.com/${fileName}`;

    return { url: publicUrl, key: fileName };
  }

  async deleteFile(fileKey: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.configService.get<string>('AWS_BUCKET_NAME'),
        Key: fileKey,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error) {
      console.error('Error deleting file from S3:', error);
      return false;
    }
  }

  getPublicUrl(fileKey: string): string {
    const bucketName = this.configService.get<string>('AWS_BUCKET_NAME');
    const region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    
    // Return the public URL that doesn't expire
    return `https://${bucketName}.s3.${region}.amazonaws.com/${fileKey}`;
  }
}
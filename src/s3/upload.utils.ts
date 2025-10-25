import { BadRequestException } from '@nestjs/common';
import { S3Service } from './s3.service';
import { ImageService } from './image.service';
import { ImageType } from '../schemas/image';

export interface UploadOptions {
  folder?: string;
  imageType?: ImageType;
  uploadedBy?: string;
  maxFileSize?: number; // Custom file size limit in bytes
}

export interface UploadResult {
  success: boolean;
  url: string;
  key: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  folder: string | null;
  imageType: ImageType;
  uploadedBy: string | null;
  imageId: string;
}

export class UploadUtils {
  private static readonly ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'text/csv',
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv',
    'video/x-matroska',
  ];

  private static readonly DEFAULT_MAX_FILE_SIZE = 100 * 1024; // 100KB default
  private static readonly ABSOLUTE_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB absolute limit

  /**
   * Get the default maximum file size in bytes
   */
  static getDefaultMaxFileSize(): number {
    return this.DEFAULT_MAX_FILE_SIZE;
  }

  /**
   * Get the absolute maximum file size in bytes
   */
  static getAbsoluteMaxFileSize(): number {
    return this.ABSOLUTE_MAX_FILE_SIZE;
  }

  /**
   * Convert KB to bytes
   */
  static kbToBytes(kb: number): number {
    return kb * 1024;
  }

  /**
   * Convert MB to bytes
   */
  static mbToBytes(mb: number): number {
    return mb * 1024 * 1024;
  }

  /**
   * Convert bytes to KB
   */
  static bytesToKb(bytes: number): number {
    return bytes / 1024;
  }

  /**
   * Convert bytes to MB
   */
  static bytesToMb(bytes: number): number {
    return bytes / (1024 * 1024);
  }

  /**
   * Upload a file with all validations, sanitizations, and database operations
   */
  static async uploadFile(
    file: Express.Multer.File,
    s3Service: S3Service,
    imageService: ImageService,
    options: UploadOptions = {}
  ): Promise<UploadResult> {
    // Validate file exists
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Determine the maximum file size for this upload
    const maxFileSize = options.maxFileSize || this.DEFAULT_MAX_FILE_SIZE;
    
    // Ensure the custom limit doesn't exceed the absolute maximum
    const effectiveMaxSize = Math.min(maxFileSize, this.ABSOLUTE_MAX_FILE_SIZE);

    // Validate file size against the effective limit
    if (file.size > effectiveMaxSize) {
      const maxSizeKB = effectiveMaxSize / 1024;
      const maxSizeMB = effectiveMaxSize / (1024 * 1024);
      
      let sizeMessage: string;
      if (effectiveMaxSize < 1024 * 1024) {
        sizeMessage = `${maxSizeKB}KB`;
      } else {
        sizeMessage = `${maxSizeMB}MB`;
      }
      
      throw new BadRequestException(`File size (${(file.size / 1024).toFixed(1)}KB) exceeds maximum limit of ${sizeMessage}`);
    }

    // Validate file type
    if (!this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      throw new BadRequestException(
        `File type ${file.mimetype} not allowed. Allowed types: ${this.ALLOWED_MIME_TYPES.join(', ')}`
      );
    }

    // Sanitize and validate folder path
    const sanitizedFolder = this.sanitizeFolderPath(options.folder);

    try {
      // Upload to S3
      const { url: fileUrl, key } = await s3Service.uploadFile(file, sanitizedFolder);

      // Determine image type
      const determinedImageType = this.determineImageType(file.mimetype, options.imageType);

      // Create database record
      const imageRecord = await imageService.createImage({
        url: fileUrl,
        key,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        folder: sanitizedFolder || null,
        imageType: determinedImageType,
        uploadedBy: options.uploadedBy || null,
      });

      return {
        success: true,
        url: fileUrl,
        key,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        folder: sanitizedFolder || null,
        imageType: determinedImageType,
        uploadedBy: options.uploadedBy || null,
        imageId: imageRecord._id as string,
      };
    } catch (error) {
      console.error('Upload error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      throw new BadRequestException(`Failed to upload file: ${errorMessage}`);
    }
  }

  /**
   * Sanitize folder path and prevent path traversal attacks
   */
  private static sanitizeFolderPath(folder?: string): string | null {
    if (!folder) return null;

    // Remove any potentially unsafe characters
    const sanitized = folder.replace(/[^a-zA-Z0-9-_/]/g, '');
    
    if (sanitized !== folder) {
      throw new BadRequestException(
        'Folder path contains invalid characters. Only alphanumeric characters, hyphens, underscores, and forward slashes are allowed.'
      );
    }

    // Prevent path traversal attempts
    if (folder.includes('..')) {
      throw new BadRequestException('Invalid folder path. Path traversal is not allowed.');
    }

    // Normalize path: remove leading/trailing slashes and empty segments
    return folder
      .split('/')
      .filter(Boolean)
      .join('/') || null;
  }

  /**
   * Determine the appropriate image type based on MIME type or user preference
   */
  private static determineImageType(mimeType: string, userImageType?: ImageType): ImageType {
    if (userImageType && Object.values(ImageType).includes(userImageType)) {
      return userImageType;
    }

    if (mimeType.startsWith('image/')) {
      return ImageType.POST; // Default for images
    }

    return ImageType.OTHER;
  }

  /**
   * Get file filter function for Multer
   */
  static getFileFilter() {
    return (req: any, file: Express.Multer.File, callback: (error: Error | null, acceptFile: boolean) => void) => {
      if (this.ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        callback(null, true);
      } else {
        callback(
          new Error(`File type ${file.mimetype} not allowed. Allowed types: ${this.ALLOWED_MIME_TYPES.join(', ')}`),
          false
        );
      }
    };
  }

  /**
   * Get Multer configuration options
   */
  static getMulterConfig(maxFileSize?: number) {
    const effectiveMaxSize = maxFileSize ? Math.min(maxFileSize, this.ABSOLUTE_MAX_FILE_SIZE) : this.DEFAULT_MAX_FILE_SIZE;
    
    return {
      limits: {
        fileSize: effectiveMaxSize,
      },
      fileFilter: this.getFileFilter(),
    };
  }
}

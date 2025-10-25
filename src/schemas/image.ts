import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Document } from 'mongoose';

export type ImageDocument = HydratedDocument<Image>;

// Image type enum for categorization
export enum ImageType {
  AVATAR = 'avatar',
  POST = 'post',
  BANNER = 'banner',
  DOCUMENT = 'document',
  OTHER = 'other',
}

// File metadata interface
export interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  extension: string;
}

@Schema({
  timestamps: true,
  collection: 'images',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  id: false,
})
export class Image extends Document {
  @Prop({ type: String, required: true, unique: true, index: true })
  url: string;

  @Prop({ type: String, required: true })
  key: string;

  @Prop({ type: String, required: true })
  fileName: string;

  @Prop({ type: Number, required: true })
  fileSize: number;

  @Prop({ type: String, required: true })
  mimeType: string;

  @Prop({ type: String, default: null })
  folder: string | null;

  @Prop({
    type: String,
    enum: ImageType,
    default: ImageType.OTHER,
    index: true,
  })
  imageType: ImageType;

  @Prop({ type: String, default: null })
  uploadedBy: string | null; // User ID who uploaded the file
}

export const ImageSchema = SchemaFactory.createForClass(Image);

// Pre-save middleware for data validation
ImageSchema.pre('save', function(next) {
  // Ensure file size is positive
  if (this.fileSize <= 0) {
    return next(new Error('File size must be positive'));
  }

  // Validate MIME type format
  if (!this.mimeType || !this.mimeType.includes('/')) {
    return next(new Error('Invalid MIME type format'));
  }

  // Ensure URL is valid
  if (!this.url || !this.url.startsWith('http')) {
    return next(new Error('Invalid URL format'));
  }

  next();
});

// Static methods for common queries
ImageSchema.statics.findByUrl = function(url: string) {
  return this.findOne({ url, isDeleted: false });
};


// Interface for static methods
export interface ImageModel {
  findByUrl(url: string): Promise<ImageDocument | null>;
}

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Image, ImageDocument, ImageType } from '../schemas/image';

@Injectable()
export class ImageService {
  constructor(
    @InjectModel(Image.name) private imageModel: Model<ImageDocument>,
  ) {}

  async createImage(imageData: {
    url: string;
    key: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    folder?: string;
    imageType?: ImageType;
    uploadedBy?: string;
  }): Promise<ImageDocument> {
    const image = new this.imageModel(imageData);
    return await image.save();
  }

  async findImageByUrl(url: string): Promise<ImageDocument | null> {
    return await this.imageModel.findOne({ url });
  }

  async findImageByKey(key: string): Promise<ImageDocument | null> {
    return await this.imageModel.findOne({ key });
  }

  async deleteImageByKey(key: string): Promise<boolean> {
    try {
      const result = await this.imageModel.deleteOne({ key });
      return result.deletedCount > 0;
    } catch (error) {
      console.error('Error deleting image from database:', error);
      return false;
    }
  }

  async findImagesByType(imageType: ImageType): Promise<ImageDocument[]> {
    return await this.imageModel.find({ imageType }).sort({ createdAt: -1 });
  }

  async findImagesByFolder(folder: string): Promise<ImageDocument[]> {
    return await this.imageModel.find({ folder }).sort({ createdAt: -1 });
  }

  async findImagesByUser(uploadedBy: string): Promise<ImageDocument[]> {
    return await this.imageModel.find({ uploadedBy }).sort({ createdAt: -1 });
  }
}

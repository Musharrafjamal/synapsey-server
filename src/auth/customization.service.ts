import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user';
import { UpdateSelectedBannerDto } from './dto/customization.dto';
import { UploadUtils, UploadOptions } from '../s3/upload.utils';
import { S3Service } from '../s3/s3.service';
import { ImageService } from '../s3/image.service';
import { ImageType } from '../schemas/image';

@Injectable()
export class CustomizationService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}

  /**
   * Upload a new banner for the user
   * @param userId - The user's ID
   * @param file - Banner image file
   * @returns Updated user document
   */
  async uploadBanner(
    userId: string,
    file: Express.Multer.File,
  ): Promise<UserDocument> {
    // Upload file using UploadUtils with proper validation and database integration
    const uploadOptions: UploadOptions = {
      folder: 'banners',
      imageType: ImageType.BANNER,
      uploadedBy: userId,
      maxFileSize: UploadUtils.kbToBytes(100), // 100KB for banners
    };

    const uploadResult = await UploadUtils.uploadFile(
      file,
      this.s3Service,
      this.imageService,
      uploadOptions,
    );

    // Use findByIdAndUpdate for more reliable persistence
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $push: { 'customization.banner.uploads': uploadResult.url },
        $set: { 'customization.banner.selected_banner': uploadResult.url }
      },
      {
        new: true,
        upsert: false,
        setDefaultsOnInsert: true
      }
    );

    return updatedUser;
  }

  /**
   * Update the selected banner for the user
   * @param userId - The user's ID
   * @param bannerData - Banner selection data
   * @returns Updated user document
   */
  async updateSelectedBanner(
    userId: string,
    bannerData: UpdateSelectedBannerDto,
  ): Promise<UserDocument> {
    const user = await this.userModel
      .findByIdAndUpdate(
        userId,
        {
          "customization.banner.selected_banner": bannerData.banner_url,
        },
        { new: true },
      )
      .select('customization');

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  /**
   * Remove a banner from user's uploads
   * @param userId - The user's ID
   * @param bannerUrl - The banner URL to remove
   * @returns Updated user document
   */
  async removeBanner(userId: string, bannerUrl: string): Promise<UserDocument> {
    // First pull the banner from uploads
    const updatedUser = await this.userModel.findByIdAndUpdate(
      userId,
      {
        $pull: { 'customization.banner.uploads': bannerUrl }
      },
      { new: true }
    );

    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    // If removed banner was selected, update selection
    if (updatedUser.customization?.banner?.selected_banner === bannerUrl) {
      const newSelectedBanner = updatedUser.customization.banner.uploads.length > 0 
        ? updatedUser.customization.banner.uploads[0] 
        : '';
      
      await this.userModel.findByIdAndUpdate(
        userId,
        {
          $set: { 'customization.banner.selected_banner': newSelectedBanner }
        }
      );

      // Update the local object for return
      updatedUser.customization.banner.selected_banner = newSelectedBanner;
    }

    return updatedUser;
  }
}

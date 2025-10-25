import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { User, UserDocument } from 'src/schemas/user';
import { Model } from 'mongoose';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadOptions, UploadUtils } from 'src/s3/upload.utils';
import { ImageType } from 'src/schemas/image';
import { S3Service } from 'src/s3/s3.service';
import { ImageService } from 'src/s3/image.service';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}

  /**
   * Gets user information from a decoded JWT token
   * @param decodedToken - The decoded JWT token payload
   * @returns User information
   */
  async updateProfile(decodedToken: any, profileData: UpdateProfileDto) {
    const user = await this.userModel.findById(decodedToken.id as string);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (profileData.name) {
      user.user.name = profileData.name;
    }
    if (profileData.phone) {
      user.user.phone_number = profileData.phone;
    }
    if (profileData.gender) {
      user.user.gender = profileData.gender;
    }
    if (profileData.dob) {
      user.user.dob = profileData.dob;
    }
    if (profileData.avatar) {
      try {
        
      const uploadOptions: UploadOptions = {
        folder: 'avatars',
        imageType: ImageType.AVATAR,
        uploadedBy: decodedToken.id,
        maxFileSize: UploadUtils.kbToBytes(50), // 50KB for avatars - better quality while keeping reasonable size
      };

      const uploadResult = await UploadUtils.uploadFile(
        profileData.avatar,
        this.s3Service,
        this.imageService,
        uploadOptions,
      );

        user.user.avatar = uploadResult.url;
      } catch (error) {
        console.error('Error uploading avatar:', error);
        throw new BadRequestException(error.message);
      }
    }

    await user.save();

    return user;
  }
}

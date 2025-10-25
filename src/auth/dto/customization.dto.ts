import { IsString, MinLength } from 'class-validator';

// Note: File upload validation is handled by Multer middleware
// This DTO is kept for potential future use or can be removed

export class UpdateSelectedBannerDto {
  @IsString()
  @MinLength(1, { message: 'Banner URL is required' })
  banner_url: string;
}

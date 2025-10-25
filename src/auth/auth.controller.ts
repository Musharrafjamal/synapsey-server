import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFile,
  Delete,
  Param,
  Put,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from './auth.service';
import { CustomizationService } from './customization.service';
import { LoginDto } from './dto/login.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { UpdateSelectedBannerDto } from './dto/customization.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileService } from './profile.service';
import { RequestPasswordResetDto } from './dto/password-reset.dto';
import { VerifyResetOtpDto } from './dto/password-reset.dto';
import { ResetPasswordDto } from './dto/password-reset.dto';
import { CheckAuthMethodDto } from './dto/check-auth-method.dto';

interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
    method: string;
  };
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly customizationService: CustomizationService,
    private readonly profileService: ProfileService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  /**
   * Check if user exists and verify authentication method compatibility
   * @param checkAuthMethodDto - Email and login method to check
   * @returns Check result with user existence and auth method compatibility
   */
  @Post('check-auth-method')
  @HttpCode(HttpStatus.OK)
  async checkAuthMethod(@Body() checkAuthMethodDto: CheckAuthMethodDto) {
    return this.authService.checkAuthMethod(checkAuthMethodDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async getProfile(@Request() req: AuthenticatedRequest) {
    // This route is protected by JWT guard
    // req.user contains the decoded JWT payload from JwtStrategy
    const user = await this.authService.getUserFromToken(req.user);
    return {
      success: true,
      user,
    };
  }
  
  @Put('update-me')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  @HttpCode(HttpStatus.OK)
  async updateProfile(
    @Request() req: AuthenticatedRequest,
    @Body() updateProfileDto: UpdateProfileDto,
    @UploadedFile() avatarFile?: Express.Multer.File,
  ) {
    // This route is protected by JWT guard
    // req.user contains the decoded JWT payload from JwtStrategy

    const profileData = {
      ...updateProfileDto,
      avatar: avatarFile || updateProfileDto.avatar
    };
    const user = await this.profileService.updateProfile(
      req.user,
      profileData,
    );
    return {
      success: true,
      user,
    };
  }

  @Get('send-email-verification')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async sendEmailVerification(@Request() req: AuthenticatedRequest) {
    return this.authService.sendEmailVerification({ email: req.user.email });
  }

  @Post('verify-email')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const payload = {
      email: req.user.email,
      code: verifyEmailDto.code,
    };
    return this.authService.verifyEmail(payload);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() requestPasswordResetDto: RequestPasswordResetDto) {
    return this.authService.sendPasswordResetOtp(requestPasswordResetDto);
  }

  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  async verifyResetOtp(@Body() verifyResetOtpDto: VerifyResetOtpDto) {
    return this.authService.verifyResetOtp(verifyResetOtpDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('customization/banner/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('banner'))
  @HttpCode(HttpStatus.OK)
  async uploadBanner(
    @UploadedFile() file: Express.Multer.File,
    @Request() req: AuthenticatedRequest,
  ) {
    if (!file) {
      return {
        success: false,
        message: 'No file uploaded',
      };
    }

    const result = await this.customizationService.uploadBanner(
      req.user.id,
      file,
    );
    return {
      success: true,
      message: 'Banner uploaded successfully',
      customization: result.customization,
    };
  }

  @Post('customization/banner/select')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateSelectedBanner(
    @Body() updateSelectedBannerDto: UpdateSelectedBannerDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const result = await this.customizationService.updateSelectedBanner(
      req.user.id,
      updateSelectedBannerDto,
    );
    return {
      success: true,
      message: 'Selected banner updated successfully',
      customization: result.customization,
    };
  }

  @Delete('customization/banner/:bannerUrl')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async removeBanner(
    @Request() req: AuthenticatedRequest,
    @Param('bannerUrl') bannerUrl: string,
  ) {
    const result = await this.customizationService.removeBanner(
      req.user.id,
      bannerUrl,
    );
    return {
      success: true,
      message: 'Banner removed successfully',
      customization: result.customization,
    };
  }
}

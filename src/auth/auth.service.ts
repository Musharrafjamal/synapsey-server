import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Inject,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthUserService } from './auth-user.service';
import { LoginDto, LoginMethod } from './dto/login.dto';
import { EmailVerificationDto } from './dto/email-verification.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { RequestPasswordResetDto } from './dto/password-reset.dto';
import { ResetPasswordDto } from './dto/password-reset.dto';
import { UserDocument } from '../schemas/user';
import { EmailService } from './email.service';
import { EMAIL_VERIFICATION_CODE_EXPIRATION_TIME, MAX_EMAIL_VERIFICATION_ATTEMPTS } from '../const/auth';
import { VerifyResetOtpDto } from './dto/password-reset.dto';
import { CheckAuthMethodDto } from './dto/check-auth-method.dto';
import { AuthMethod } from '../schemas/user';
import * as admin from 'firebase-admin';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly authUserService: AuthUserService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    @Inject('FIREBASE_APP') private readonly firebaseApp: admin.app.App,
  ) {}

  /**
   * Gets user information from a decoded JWT token
   * @param decodedToken - The decoded JWT token payload
   * @returns User information
   */
  async getUserFromToken(decodedToken: any) {
    const user = await this.authUserService.profileById(
      decodedToken.id as string,
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  /**
   * Checks if user exists and if their authentication method matches the requested login method
   * @param checkAuthMethodDto - Email and login method to check
   * @returns Check result with compatibility information
   */
  async checkAuthMethod(checkAuthMethodDto: CheckAuthMethodDto) {
    const { email, loginMethod } = checkAuthMethodDto;

    const userCheck = await this.authUserService.checkUserAuthMethod(email);

    if (!userCheck.exists) {
      return {
        success: true,
        exists: false,
        message: 'User does not exist. You can proceed with registration.',
        canProceed: true,
      };
    }

    // Map LoginMethod enum to AuthMethod enum
    const expectedAuthMethod = loginMethod === LoginMethod.GOOGLE ? AuthMethod.GOOGLE_OAUTH : AuthMethod.EMAIL_PASSWORD;
    const actualAuthMethod = userCheck.authMethod;

    if (expectedAuthMethod === actualAuthMethod) {
      return {
        success: true,
        exists: true,
        authMethodMatch: true,
        message: 'User exists and authentication method matches. You can proceed with login.',
        canProceed: true,
        authMethod: actualAuthMethod,
      };
    } else {
      const actualMethodText = actualAuthMethod === AuthMethod.GOOGLE_OAUTH ? 'Google' : 'Email/Password';
      return {
        success: true,
        exists: true,
        authMethodMatch: false,
        message: `This account exists using ${actualMethodText} authentication. Please use the correct login method.`,
        canProceed: false,
        actualAuthMethod: actualMethodText,
        requestedAuthMethod: loginMethod === LoginMethod.GOOGLE ? 'Google' : 'Email/Password',
      };
    }
  }

  /**
   * Handles user login for both Google OAuth and email/password
   * @param loginDto - Login credentials and method
   * @returns Login result with JWT token and user info
   */
  async login(loginDto: LoginDto) {
    const { loginVia, email, password, metadata } = loginDto;

    // Check if user exists
    let user = await this.authUserService.findByEmail(email);

    if (loginVia === LoginMethod.GOOGLE) {
      // Google OAuth login
      if (!user) {
        // Create new user for Google OAuth
        user = await this.authUserService.createGoogleUser(email, metadata);

        // Send welcome email to new user
        try {
          await this.emailService.sendWelcomeEmail(
            email,
            user.user.name || 'User',
            'google',
          );
        } catch (error) {
          // Log error but don't fail the login
          console.error('Failed to send welcome email:', error);
        }
      } else {
        // Update existing user's metadata only if fields are empty
        user = await this.authUserService.updateGoogleUserMetadata(
          user._id as string,
          metadata,
        );
      }

      // For Google OAuth, we don't need to verify password
      // Just generate JWT token
      const token = this.generateToken(user);
      return {
        success: true,
        token,
        user: {
          id: user._id,
          email: user.user.email,
          name: user.user.name,
          avatar: user.user.avatar,
          status: user.status,
        },
      };
    } else if (loginVia === LoginMethod.EMAIL) {
      // Email/Password login
      if (!password) {
        throw new UnauthorizedException('Password is required for email login');
      }

      if (!user) {
        // Create new user for email/password
        user = await this.authUserService.createEmailUser(email, password, metadata.uuid);

        // Send welcome email to new user
        try {
          await this.emailService.sendWelcomeEmail(
            email,
            user.user.name || 'User',
            'email',
          );
        } catch (error) {
          // Log error but don't fail the login
          console.error('Failed to send welcome email:', error);
        }
      } else {
        // Verify password for existing user
        const isPasswordValid = await this.authUserService.verifyPassword(
          user,
          password,
        );
        if (!isPasswordValid) {
          throw new UnauthorizedException('Invalid credentials');
        }
      }

      const token = this.generateToken(user);
      return {
        success: true,
        token,
        user: {
          id: user._id,
          email: user.user.email,
          name: user.user.name,
          avatar: user.user.avatar,
          status: user.status,
        },
      };
    }

    throw new UnauthorizedException('Invalid login method');
  }

  /**
   * Generates a JWT token for a user
   * @param user - The user document
   * @returns JWT token string
   */
  private generateToken(user: UserDocument) {
    const payload = {
      id: user._id,
      email: user.user.email,
      method: user.auth.method,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Sends an email verification code to the specified address
   * @param emailVerificationDto - Email verification details
   * @returns Email sending result
   */
  async sendEmailVerification(emailVerificationDto: EmailVerificationDto) {
    const { email } = emailVerificationDto;

    // Check if user exists
    const user = await this.authUserService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Check if user is already verified
    if (user.auth.email_verified) {
      throw new BadRequestException('Email is already verified');
    }

    // Check if user has exceeded verification attempts
    if (user.hasExceededVerificationAttempts()) {
      throw new BadRequestException(
        'Too many verification attempts. Please try again later.',
      );
    }

    // Check if verification code is still valid (not expired)
    // Allow re-sending verification code every 30 seconds
    if (
      user.auth.email_verification &&
      user.auth.email_verification.last_attempt_at
    ) {
      const timeSinceLastAttempt =
        Date.now() - user.auth.email_verification.last_attempt_at.getTime();
      const thirtySeconds = 30 * 1000; // 30 seconds in milliseconds

      if (timeSinceLastAttempt < thirtySeconds) {
        const timeRemaining = Math.ceil(
          (thirtySeconds - timeSinceLastAttempt) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${timeRemaining} seconds before requesting a new verification code.`,
        );
      }
    }

    // Generate new verification code using user schema method
    await user.generateVerificationCode();
    const verificationCode = user.auth.email_verification.code;

    // Send verification email
    const success = await this.emailService.sendCustomEmail(email, {
      title: 'Email Verification Code - Synapsy',
      content: `
        <p>Your email verification code is:</p>
        <div style="background: #f8f9fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h1 style="color: #667eea; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0;">${verificationCode}</h1>
        </div>
        <p>Please enter this code to verify your email address.</p>
        <p><strong>Note:</strong> This code will expire in ${EMAIL_VERIFICATION_CODE_EXPIRATION_TIME} minutes for security reasons.</p>
      `,
      showActionButton: false,
    });

    if (!success) {
      throw new BadRequestException('Failed to send verification email');
    }

    return {
      success: true,
      message: 'Verification code sent successfully',
      email,
    };
  }

  /**
   * Verifies the email verification code
   * @param verifyEmailDto - Email verification details
   * @returns Verification result
   */
  async verifyEmail(verifyEmailDto: VerifyEmailDto) {
    const { email, code } = verifyEmailDto;

    // Check if user exists
    const user = await this.authUserService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Check if user is already verified
    if (user.auth.email_verified) {
      throw new BadRequestException('Email is already verified');
    }

    // Verify the code using user schema method
    const isValid = await user.verifyEmailCode(code);

    if (!isValid) {
      // Check specific failure reasons
      if (user.hasExceededVerificationAttempts()) {
        throw new BadRequestException(
          'Too many verification attempts. Please request a new code.',
        );
      }

      if (user.auth.email_verification && user.isVerificationCodeExpired()) {
        throw new BadRequestException(
          'Verification code has expired. Please request a new code.',
        );
      }

      throw new BadRequestException('Invalid verification code');
    }

    // Send verification success email
    try {
      await this.emailService.sendVerificationSuccessEmail(
        user.user.email,
        user.user.name || 'User',
      );
    } catch (error) {
      // Log error but don't fail the verification
      console.error('Failed to send verification success email:', error);
    }

    return {
      success: true,
      message: 'Email verified successfully',
      user: {
        id: user._id,
        email: user.user.email,
        name: user.user.name,
        status: user.status,
        email_verified: user.auth.email_verified,
      },
    };
  }

  /**
   * Sends a password reset OTP to the specified email address
   * @param requestPasswordResetDto - Password reset request details
   * @returns OTP sending result
   */
  async sendPasswordResetOtp(requestPasswordResetDto: RequestPasswordResetDto) {
    const { email } = requestPasswordResetDto;

    // Check if user exists
    const user = await this.authUserService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Check if user has exceeded password reset attempts
    if (this.hasExceededPasswordResetAttempts(user)) {
      throw new BadRequestException(
        'Too many password reset attempts. Please try again later.',
      );
    }

    // Check if password reset OTP is still valid (not expired)
    // Allow re-sending OTP every 30 seconds
    if (user.auth.password_reset && user.auth.password_reset.last_attempt_at) {
      const timeSinceLastAttempt =
        Date.now() - user.auth.password_reset.last_attempt_at.getTime();
      const thirtySeconds = 30 * 1000; // 30 seconds in milliseconds

      if (timeSinceLastAttempt < thirtySeconds) {
        const timeRemaining = Math.ceil(
          (thirtySeconds - timeSinceLastAttempt) / 1000,
        );
        throw new BadRequestException(
          `Please wait ${timeRemaining} seconds before requesting a new password reset OTP.`,
        );
      }
    }

    // Generate new password reset OTP
    const otp = Math.floor(100000 + Math.random() * 900000);
    const expires_at = new Date(Date.now() + EMAIL_VERIFICATION_CODE_EXPIRATION_TIME);
    
    const passwordReset = {
      otp,
      expires_at,
      attempts: 0,
      last_attempt_at: new Date(),
    };

    // Update user with password reset data
    await this.authUserService.updatePasswordResetData(user._id as string, passwordReset);

    // Send password reset email
    const success = await this.emailService.sendCustomEmail(email, {
      title: 'Password Reset OTP - Synapsy',
      content: `
        <p>Your password reset OTP is:</p>
        <div style="background: #f8f9fa; border: 2px solid #667eea; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
          <h1 style="color: #667eea; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0;">${otp}</h1>
        </div>
        <p>Please enter this OTP to reset your password.</p>
        <p><strong>Note:</strong> This OTP will expire in ${EMAIL_VERIFICATION_CODE_EXPIRATION_TIME} minutes for security reasons.</p>
        <p>If you didn't request this password reset, please ignore this email.</p>
      `,
      showActionButton: false,
    });

    if (!success) {
      throw new BadRequestException('Failed to send password reset OTP');
    }

    return {
      success: true,
      message: 'Password reset OTP sent successfully',
      email,
    };
  }

  /**
   * Verifies the password reset OTP
   * @param verifyResetOtpDto - OTP verification details
   * @returns OTP verification result with reset token
   */
  async verifyResetOtp(verifyResetOtpDto: VerifyResetOtpDto) {
    const { email, otp } = verifyResetOtpDto;

    // Check if user exists
    const user = await this.authUserService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Verify the OTP
    const isValid = await this.verifyPasswordResetOtp(user, otp);

    if (!isValid) {
      // Check specific failure reasons
      if (this.hasExceededPasswordResetAttempts(user)) {
        throw new BadRequestException(
          'Too many password reset attempts. Please request a new OTP.',
        );
      }

      if (user.auth.password_reset && this.isPasswordResetOtpExpired(user)) {
        throw new BadRequestException(
          'Password reset OTP has expired. Please request a new OTP.',
        );
      }

      throw new BadRequestException('Invalid password reset OTP');
    }

    // Generate reset token for password reset
    const resetToken = this.generateResetToken();
    const resetTokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Update user with reset token
    await this.authUserService.updatePasswordResetData(
      user._id as string, 
      {
        ...user.auth.password_reset,
        resetToken,
        resetTokenExpiresAt
      }
    );

    return {
      success: true,
      message: 'OTP verified successfully. You can now reset your password.',
      email,
      otpVerified: true,
      resetToken,
    };
  }

  /**
   * Resets the password using the reset token
   * @param resetPasswordDto - Password reset details
   * @returns Password reset result
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, resetToken, newPassword } = resetPasswordDto;

    // Check if user exists
    const user = await this.authUserService.findByEmail(email);

    if (!user) {
      throw new BadRequestException('User with this email does not exist');
    }

    // Verify the reset token
    if (!this.isResetTokenValid(user, resetToken)) {
      throw new BadRequestException('Invalid or expired reset token. Please verify OTP again.');
    }

    // Update the password in our database
    await this.authUserService.updatePassword(user._id as string, newPassword);

    // Update Firebase password (only for email/password users)
    let firebaseUpdateSuccess = true;
    let firebaseErrorMessage = '';
    
    if (user.auth.method === AuthMethod.EMAIL_PASSWORD) {
      firebaseUpdateSuccess = await this.updateFirebasePassword(
        user.user.email, 
        newPassword, 
        user.auth.uuid
      );
      
      if (!firebaseUpdateSuccess) {
        firebaseErrorMessage = 'Password updated in our system but failed to sync with Firebase. Please try logging in again.';
        this.logger.error(`Firebase password update failed for user: ${email}`);
      }
    }

    // Clear password reset data
    await this.authUserService.clearPasswordResetData(user._id as string);

    // Send password reset success email
    try {
      await this.emailService.sendPasswordResetSuccessEmail(
        user.user.email,
        user.user.name || 'User',
      );
    } catch (error) {
      // Log error but don't fail the password reset
      console.error('Failed to send password reset success email:', error);
    }

    // Return response with Firebase update status
    const response = {
      success: true,
      message: firebaseUpdateSuccess 
        ? 'Password reset successfully' 
        : 'Password reset completed with warnings',
      user: {
        id: user._id,
        email: user.user.email,
        name: user.user.name,
        status: user.status,
      },
    };

    // Add Firebase error message if update failed
    if (!firebaseUpdateSuccess) {
      response['warning'] = firebaseErrorMessage;
    }

    return response;
  }

  /**
   * Checks if user has exceeded password reset attempts
   */
  private hasExceededPasswordResetAttempts(user: UserDocument): boolean {
    if (!user.auth.password_reset) {
      return false;
    }
    return user.auth.password_reset.attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS;
  }

  /**
   * Checks if password reset OTP has expired
   */
  private isPasswordResetOtpExpired(user: UserDocument): boolean {
    if (!user.auth.password_reset) {
      return true;
    }
    return new Date() > user.auth.password_reset.expires_at;
  }

  /**
   * Verifies password reset OTP
   */
  private async verifyPasswordResetOtp(user: UserDocument, otp: string): Promise<boolean> {
    if (!user.auth.password_reset) {
      return false;
    }

    // Check if OTP has expired
    if (this.isPasswordResetOtpExpired(user)) {
      return false;
    }

    // Check if attempts exceeded
    if (this.hasExceededPasswordResetAttempts(user)) {
      return false;
    }

    // Increment attempts
    const attempts = user.auth.password_reset.attempts + 1;
    const last_attempt_at = new Date();

    // Update attempts in database
    await this.authUserService.updatePasswordResetAttempts(user._id as string, attempts, last_attempt_at);

    // Check if OTP matches
    if (user.auth.password_reset.otp === Number(otp)) {
      return true;
    }

    return false;
  }

  /**
   * Updates Firebase user password
   * @param email - User's email address
   * @param newPassword - New password
   * @param firebaseUuid - Optional Firebase UUID for faster lookup
   * @returns Promise<boolean> - True if successful, false if failed
   */
  private async updateFirebasePassword(
    email: string, 
    newPassword: string, 
    firebaseUuid?: string
  ): Promise<boolean> {
    try {
      const auth = this.firebaseApp.auth();
      let firebaseUser: admin.auth.UserRecord;

      // Try to find user by UUID first (faster), then by email
      if (firebaseUuid) {
        try {
          firebaseUser = await auth.getUser(firebaseUuid);
          this.logger.log(`Found Firebase user by UUID: ${firebaseUuid}`);
        } catch (uuidError) {
          this.logger.warn(`Failed to find Firebase user by UUID ${firebaseUuid}, trying email: ${email}`, uuidError);
          firebaseUser = await auth.getUserByEmail(email);
        }
      } else {
        firebaseUser = await auth.getUserByEmail(email);
        this.logger.log(`Found Firebase user by email: ${email}`);
      }

      // Update the password
      await auth.updateUser(firebaseUser.uid, {
        password: newPassword
      });

      this.logger.log(`Successfully updated Firebase password for user: ${email}`);
      return true;

    } catch (error) {
      this.logger.error(`Failed to update Firebase password for user: ${email}`, error);
      
      // Log specific error types for better debugging
      if (error.code === 'auth/user-not-found') {
        this.logger.warn(`Firebase user not found: ${email}`);
      } else if (error.code === 'auth/invalid-password') {
        this.logger.warn(`Invalid password format for Firebase user: ${email}`);
      } else if (error.code === 'auth/network-request-failed') {
        this.logger.error(`Network error updating Firebase password for: ${email}`);
      }
      
      return false;
    }
  }

  /**
   * Generates a secure reset token
   */
  private generateResetToken(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  /**
   * Checks if reset token is valid
   */
  private isResetTokenValid(user: UserDocument, resetToken: string): boolean {
    if (!user.auth.password_reset?.resetToken || !user.auth.password_reset?.resetTokenExpiresAt) {
      return false;
    }

    if (user.auth.password_reset.resetToken !== resetToken) {
      return false;
    }

    if (new Date() > user.auth.password_reset.resetTokenExpiresAt) {
      return false;
    }

    return true;
  }
}

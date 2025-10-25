import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument, AuthMethod, UserStatus } from '../schemas/user';
import { UserMetadata } from './dto/login.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthUserService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  /**
   * Find user by email address
   * @param email - The email address to search for
   * @returns User document or null if not found
   */
  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ 'user.email': email }).exec();
  }

  /**
   * Check if user exists and get their authentication method
   * @param email - The email address to search for
   * @returns Object with user existence and auth method info
   */
  async checkUserAuthMethod(email: string): Promise<{
    exists: boolean;
    authMethod?: AuthMethod;
    message?: string;
  }> {
    const user = await this.userModel
      .findOne({ 'user.email': email })
      .select('auth.method')
      .exec();

    if (!user) {
      return {
        exists: false,
        message: 'User does not exist',
      };
    }

    return {
      exists: true,
      authMethod: user.auth.method,
      message: 'User exists',
    };
  }

  /**
   * Find user by ID (without password)
   * @param id - The user's ID
   * @returns User document or null if not found
   */
  async findById(id: string): Promise<UserDocument | null> {
    return this.userModel
      .findOne({ _id: id, status: UserStatus.ACTIVE })
      .select('-auth.password')
      .exec();
  }
  /**
   * Find user by ID (without password)
   * @param id - The user's ID
   * @returns User document or null if not found
   */
  async profileById(id: string): Promise<UserDocument | null> {
    const user = await this.userModel
      .findOne({ _id: id })
      .select('user auth.email_verified status customization createdAt')
      .exec();

    return user;
  }

  /**
   * Creates a new Google OAuth user
   * @param email - The user's email address
   * @param metadata - The user metadata from Google
   * @returns Newly created user document
   */
  async createGoogleUser(
    email: string,
    metadata: UserMetadata,
  ): Promise<UserDocument> {
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const userData = {
      user: {
        name: metadata.name || 'Unknown User',
        avatar: metadata.avatar || null,
        phone_number: metadata.phone || null,
        email: email,
      },
      auth: {
        uuid: metadata.uuid, // Use UUID from Google
        method: AuthMethod.GOOGLE_OAUTH,
        email_verified: metadata.email_verified || false,
        email_verification: metadata.email_verified ? undefined : {
          code: '',
          expires_at: new Date(),
          attempts: 0,
          last_attempt_at: new Date(),
        },
        last_login_at: new Date(),
      },
      status: metadata.email_verified ? UserStatus.ACTIVE : UserStatus.PENDING_VERIFICATION,
      deviceTokens: [],
    };

    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  /**
   * Creates a new email/password user
   * @param email - The user's email address
   * @param password - The user's password (will be hashed)
   * @param uuid - The user's uuid
   * @returns Newly created user document
   */
  async createEmailUser(
    email: string,
    password: string,
    uuid: string,
  ): Promise<UserDocument> {
    const existingUser = await this.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const userData = {
      user: {
        name: 'Unknown User',
        avatar: null,
        phone_number: null,
        email: email,
      },
      auth: {
        uuid: uuid,
        method: AuthMethod.EMAIL_PASSWORD,
        password: hashedPassword,
        email_verified: false,
        email_verification: {
          code: 0,
          expires_at: new Date(),
          attempts: 0,
          last_attempt_at: new Date(),
        },
        last_login_at: new Date(),
      },
      status: UserStatus.PENDING_VERIFICATION,
      deviceTokens: [],
    };

    const newUser = new this.userModel(userData);
    return newUser.save();
  }

  /**
   * Updates Google OAuth user metadata only for empty fields
   * @param userId - The user's ID
   * @param metadata - The metadata to potentially update
   * @returns Updated user document
   */
  async updateGoogleUserMetadata(
    userId: string,
    metadata: UserMetadata,
  ): Promise<UserDocument> {
    const user = await this.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.auth.method !== AuthMethod.GOOGLE_OAUTH) {
      throw new Error('User is not a Google OAuth user');
    }

    const updateData: Record<string, any> = {};

    // Only update name if it's empty or undefined
    if (!user.user.name && metadata.name) {
      updateData['user.name'] = metadata.name;
    }

    // Only update avatar if it's empty or undefined
    if (!user.user.avatar && metadata.avatar) {
      updateData['user.avatar'] = metadata.avatar;
    }

    // Only update phone_number if it's empty or undefined
    if (!user.user.phone_number && metadata.phone) {
      updateData['user.phone_number'] = metadata.phone;
    }

    // Only update email_verified if it's false and metadata has true
    if (!user.auth.email_verified && metadata.email_verified) {
      updateData['auth.email_verified'] = metadata.email_verified;
    }

    // Only update uuid if it's empty or undefined
    if (!user.auth.uuid && metadata.uuid) {
      updateData['auth.uuid'] = metadata.uuid;
    }

    // Update last_login_at
    updateData['auth.last_login_at'] = new Date();

    if (Object.keys(updateData).length > 0) {
      return this.userModel.findByIdAndUpdate(
        userId,
        { $set: updateData },
        { new: true },
      ).exec();
    }

    return user;
  }

  /**
   * Verifies password for email/password users
   * @param user - The user document
   * @param password - The password to verify
   * @returns True if password is valid
   */
  async verifyPassword(user: UserDocument, password: string): Promise<boolean> {
    if (user.auth.method !== AuthMethod.EMAIL_PASSWORD || !user.auth.password) {
      return false;
    }
    return bcrypt.compare(password, user.auth.password);
  }

  /**
   * Updates user password (for password reset)
   * @param userId - The user's ID
   * @param newPassword - The new password to set
   * @returns Updated user document
   */
  async updatePassword(userId: string, newPassword: string): Promise<UserDocument> {
    // Hash the new password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

    // Update the password in the database
    return this.userModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          'auth.password': hashedPassword,
          'auth.last_login_at': new Date()
        } 
      },
      { new: true }
    ).exec();
  }

  /**
   * Updates password reset data for a user
   * @param userId - The user's ID
   * @param passwordReset - The password reset data
   * @returns Updated user document
   */
  async updatePasswordResetData(userId: string, passwordReset: any): Promise<UserDocument> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          'auth.password_reset': passwordReset
        } 
      },
      { new: true }
    ).exec();
  }

  /**
   * Updates password reset attempts for a user
   * @param userId - The user's ID
   * @param attempts - The number of attempts
   * @param lastAttemptAt - The timestamp of the last attempt
   * @returns Updated user document
   */
  async updatePasswordResetAttempts(userId: string, attempts: number, lastAttemptAt: Date): Promise<UserDocument> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { 
        $set: { 
          'auth.password_reset.attempts': attempts,
          'auth.password_reset.last_attempt_at': lastAttemptAt
        } 
      },
      { new: true }
    ).exec();
  }

  /**
   * Clears password reset data for a user
   * @param userId - The user's ID
   * @returns Updated user document
   */
  async clearPasswordResetData(userId: string): Promise<UserDocument> {
    return this.userModel.findByIdAndUpdate(
      userId,
      { 
        $unset: { 
          'auth.password_reset': 1
        } 
      },
      { new: true }
    ).exec();
  }
}

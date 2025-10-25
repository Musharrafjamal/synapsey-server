import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Document } from 'mongoose';
import {
  MAX_EMAIL_VERIFICATION_ATTEMPTS,
  EMAIL_VERIFICATION_CODE_EXPIRATION_TIME,
} from '../const/auth';
import { ChatDocument } from './ai-listener/chat';

export type UserDocument = HydratedDocument<User> & UserMethods;

// Authentication methods enum
export enum AuthMethod {
  EMAIL_PASSWORD = 'email_password',
  GOOGLE_OAUTH = 'google_oauth',
}

// User status enum
export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

// Profile information interface
export interface UserProfile {
  name: string;
  avatar?: string;
  phone_number?: string;
  email: string;
  gender?: 'male' | 'female' | 'other';
  dob?: Date;
}

// Authentication details interface
export interface EmailVerification {
  code: number;
  expires_at: Date;
  attempts: number;
  last_attempt_at: Date;
}

export interface PasswordReset {
  otp: number;
  expires_at: Date;
  attempts: number;
  last_attempt_at: Date;
  resetToken?: string;
  resetTokenExpiresAt?: Date;
}

export interface AuthDetails {
  uuid: string;
  method: AuthMethod;
  password?: string;
  last_login_at?: Date;
  email_verified: boolean;
  email_verification: EmailVerification;
  password_reset?: PasswordReset;
}
export interface Customization {
  banner: BannerCustomization;
}

export interface BannerCustomization {
  uploads: string[];
  selected_banner: string;
}
export interface UserChats {
  ai_listener_chats: [mongoose.Schema.Types.ObjectId] | ChatDocument[]
}

// Interface for instance methods - now defined in schema methods
export interface UserMethods {
  generateVerificationCode(): Promise<UserDocument>;
  verifyEmailCode(code: string): Promise<boolean>;
  isVerificationCodeExpired(): boolean;
  hasExceededVerificationAttempts(): boolean;
}

@Schema({
  timestamps: true, // Automatically adds createdAt and updatedAt
  collection: 'users',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  id: false, // Disable the id virtual
})
export class User extends Document {
  @Prop({
    type: {
      name: { type: String, required: false },
      email: { type: String, required: true },
      avatar: { type: String, required: false },
      phone_number: { type: String, required: false },
      gender: {
        type: String,
        enum: ['male', 'female', 'other'],
        required: false,
      },
      dob: { type: Date, required: false },
    },
    required: true,
  })
  user: UserProfile;

  @Prop({ type: Object, required: true })
  auth: AuthDetails;

  @Prop({
    type: String,
    enum: UserStatus,
    default: UserStatus.PENDING_VERIFICATION,
  })
  status: UserStatus;

  @Prop({
    type: {
      banner: {
        uploads: { type: [String], default: [] },
        selected_banner: { type: String, default: '' },
      },
    },
    default: {
      banner: {
        uploads: [],
        selected_banner: '',
      },
    },
  })
  customization: Customization;

  @Prop({ type: [String], default: [] })
  deviceTokens: string[];

  @Prop({
    type: {
      ai_listener_chats: {
        type: [mongoose.Schema.Types.ObjectId],
        ref: 'AiListenerChat',
        default: [],
      },
    },
    default: {
      ai_listener_chats: [],
    },
  })
  chats: UserChats;
}

export const UserSchema = SchemaFactory.createForClass(User);

// Auth methods
UserSchema.methods.generateVerificationCode = async function () {
  // Generate 6-digit verification code
  const code = Math.floor(100000 + Math.random() * 900000);

  // Set expiration time (10 minutes from now)
  const expires_at = new Date(
    Date.now() + EMAIL_VERIFICATION_CODE_EXPIRATION_TIME,
  );

  // Reset attempts and set last attempt time
  const emailVerification = {
    code,
    expires_at,
    attempts: 0,
    last_attempt_at: new Date(),
  };

  // Use findByIdAndUpdate for more reliable persistence
  const updatedDoc = await this.constructor.findByIdAndUpdate(
    this._id,
    {
      $set: {
        'auth.email_verification': emailVerification,
      },
    },
    { new: true },
  );

  // Update the current instance
  this.auth.email_verification = emailVerification;

  return updatedDoc;
};

UserSchema.methods.verifyEmailCode = async function (code: string) {
  if (!this.auth.email_verification) {
    return false;
  }

  // Check if code has expired
  if (this.isVerificationCodeExpired()) {
    return false;
  }

  // Check if attempts exceeded
  if (this.hasExceededVerificationAttempts()) {
    return false;
  }

  // Increment attempts
  this.auth.email_verification.attempts += 1;
  this.auth.email_verification.last_attempt_at = new Date();

  // Check if code matches
  if (this.auth.email_verification.code === Number(code)) {
    // Mark email as verified and update status
    const updateData = {
      'auth.email_verified': true,
      status: UserStatus.ACTIVE,
      'auth.email_verification': undefined,
    };

    // Use findByIdAndUpdate for more reliable persistence
    await this.constructor.findByIdAndUpdate(this._id, { $set: updateData });

    // Update the current instance
    this.auth.email_verified = true;
    this.status = UserStatus.ACTIVE;
    this.auth.email_verification = undefined as any;

    return true;
  }

  // Update attempts in database
  await this.constructor.findByIdAndUpdate(this._id, {
    $set: {
      'auth.email_verification.attempts': this.auth.email_verification.attempts,
      'auth.email_verification.last_attempt_at':
        this.auth.email_verification.last_attempt_at,
    },
  });

  return false;
};

UserSchema.methods.isVerificationCodeExpired = function () {
  if (!this.auth.email_verification) {
    return true;
  }
  return new Date() > this.auth.email_verification.expires_at;
};

UserSchema.methods.hasExceededVerificationAttempts = function () {
  if (!this.auth.email_verification) {
    return false;
  }
  return (
    this.auth.email_verification.attempts >= MAX_EMAIL_VERIFICATION_ATTEMPTS
  );
};

// Indexes for performance
UserSchema.index({ 'user.email': 1 }, { unique: true });
UserSchema.index({ createdAt: -1 });

// Pre-save middleware for data validation
UserSchema.pre('save', function (this: UserDocument, next) {
  // Ensure at least one authentication method is provided
  if (!this.auth.password && this.auth.method !== AuthMethod.GOOGLE_OAUTH) {
    return next(
      new Error('User must have either password or Google OAuth data'),
    );
  }

  // Set authentication method based on available data
  if (this.auth.method === AuthMethod.GOOGLE_OAUTH) {
    this.auth.method = AuthMethod.GOOGLE_OAUTH;
  } else if (this.auth.password) {
    this.auth.method = AuthMethod.EMAIL_PASSWORD;
  }

  next();
});

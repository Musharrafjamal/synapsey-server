import { IsEnum, IsEmail, IsOptional, IsString, IsObject, IsBoolean, IsUUID, MinLength, ValidateIf } from 'class-validator';
import { Type } from 'class-transformer';

export enum LoginMethod {
  GOOGLE = 'google',
  EMAIL = 'email',
}

export interface UserMetadata {
  name?: string;
  avatar?: string;
  phone?: string;
  email_verified?: boolean;
  uuid?: string;
}

export class UserMetadataDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Avatar must be a string' })
  avatar?: string;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @IsOptional()
  @IsBoolean({ message: 'Email verified must be a boolean' })
  email_verified?: boolean;

  @IsOptional()
  @IsUUID(4, { message: 'UUID must be a valid UUID v4' })
  uuid?: string;
}
export class LoginDto {
  @IsEnum(LoginMethod, { message: 'loginVia must be either "google" or "email"' })
  loginVia: LoginMethod;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  email: string;

  @ValidateIf(o => o.loginVia === LoginMethod.EMAIL)
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password?: string;

  @ValidateIf(o => o.loginVia === LoginMethod.GOOGLE)
  @IsOptional()
  @IsObject({ message: 'Metadata must be an object' })
  @Type(() => UserMetadataDto)
  metadata?: UserMetadataDto;
}



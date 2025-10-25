import { IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { LoginMethod } from './login.dto';

export class CheckAuthMethodDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsEnum(LoginMethod, { message: 'Login method must be either "google" or "email"' })
  @IsNotEmpty({ message: 'Login method is required' })
  loginMethod: LoginMethod;
}

import { IsDate, IsString } from 'class-validator';

export class UpdateProfileDto {
  @IsString({ message: 'Name must be a string' })
  name: string | null;

  @IsString({ message: 'Avatar must be a string' })
  avatar: Express.Multer.File | null;

  @IsString({ message: 'Phone must be a string' })
  phone: string | null;

  @IsString({ message: 'Gender must be a string' })
  gender: "male" | "female" | "other" | null;

  @IsDate({ message: 'DOB must be a date' })
  dob: Date | null;
}

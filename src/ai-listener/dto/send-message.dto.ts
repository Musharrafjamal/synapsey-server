import { IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ArrayMaxSize } from "class-validator";

export class SendMessageDto {
  @IsString({ message: 'Content must be a string' })
  @IsNotEmpty({ message: 'Content cannot be empty' })
  @MaxLength(1000, { message: 'Content cannot exceed 10000 characters' })
  content: string;
  
  @IsOptional()
  @IsArray({ message: 'Attachments must be an array' })
  @ArrayMaxSize(6, { message: 'Cannot upload more than 6 attachments' })
  attachments?: Express.Multer.File[];
}

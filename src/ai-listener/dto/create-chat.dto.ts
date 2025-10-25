import { IsOptional, IsString, IsNumber, Min, Max, MaxLength, IsNotEmpty } from 'class-validator';

export class CreateChatDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  @IsNotEmpty({ message: 'Title cannot be empty if provided' })
  title?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Temperature must be a number' })
  @Min(0, { message: 'Temperature must be at least 0' })
  @Max(2, { message: 'Temperature cannot exceed 2' })
  temperature?: number;
}

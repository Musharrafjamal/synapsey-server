import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';

export class AskQuestionDto {
  @IsNotEmpty({ message: 'Question is required' })
  @IsString({ message: 'Question must be a string' })
  @MinLength(1, { message: 'Question must be at least 1 character long' })
  @MaxLength(1000, { message: 'Question cannot exceed 1,000 characters' })
  message: string;
}

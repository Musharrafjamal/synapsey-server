import { IsOptional, IsString, IsEnum, MaxLength, IsNotEmpty } from 'class-validator';
import { ChatStatus } from '../../schemas/ai-listener/chat';

export class UpdateChatDto {
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  @IsNotEmpty({ message: 'Title cannot be empty if provided' })
  title?: string;

  @IsOptional()
  @IsEnum(ChatStatus, { message: 'Status must be a valid ChatStatus enum value' })
  status?: ChatStatus;
}

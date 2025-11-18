import {
  IsOptional,
  IsString,
  MaxLength,
  IsNotEmpty,
  IsArray,
  ValidateNested,
  ArrayMinSize,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  Validate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { QuestionPreferenceDto } from './question-preference.dto';

/**
 * Custom validator to ensure both context (attachments OR prompt) AND question_preference are provided
 */
@ValidatorConstraint({ name: 'hasContextAndQuestionPreference', async: false })
export class HasContextAndQuestionPreferenceConstraint
  implements ValidatorConstraintInterface
{
  validate(value: any, args: ValidationArguments) {
    const object = args.object as CreateChatDto;
    const hasAttachments = object.attachments && object.attachments.length > 0;
    const hasPrompt = object.prompt && object.prompt.trim().length > 0;
    const hasContext = hasAttachments || hasPrompt;
    const hasQuestionPreference =
      object.question_preference && object.question_preference.length > 0;

    // Both context (attachments OR prompt) AND at least one question preference are required
    return hasContext && hasQuestionPreference;
  }

  defaultMessage(args: ValidationArguments) {
    const object = args.object as CreateChatDto;
    const hasAttachments = object.attachments && object.attachments.length > 0;
    const hasPrompt = object.prompt && object.prompt.trim().length > 0;
    const hasContext = hasAttachments || hasPrompt;
    const hasQuestionPreference =
      object.question_preference && object.question_preference.length > 0;

    if (!hasContext && hasQuestionPreference) {
      return 'Context (attachments or prompt) is required';
    }
    if (hasContext && !hasQuestionPreference) {
      return 'At least one question preference is required';
    }
    return 'Both context (attachments or prompt) and at least one question preference are required';
  }
}

/**
 * DTO for creating a new chat
 */
export class CreateChatDto {
  /** Optional chat title (max 200 characters) */
  @IsOptional()
  @IsString({ message: 'Title must be a string' })
  @MaxLength(200, { message: 'Title cannot exceed 200 characters' })
  @IsNotEmpty({ message: 'Title cannot be empty if provided' })
  title?: string;

  /** Optional prompt for context (max 10000 characters) */
  @IsOptional()
  @IsString({ message: 'Prompt must be a string' })
  @MaxLength(10000, { message: 'Prompt cannot exceed 10000 characters' })
  prompt?: string;

  /** Optional file attachments (images: png, jpeg, etc. and PDFs) */
  @IsOptional()
  @IsArray({ message: 'Attachments must be an array' })
  attachments?: Express.Multer.File[];

  /** Optional question preferences array */
  @IsOptional()
  @IsArray({ message: 'Question preferences must be an array' })
  @ArrayMinSize(1, { message: 'At least one question preference is required if provided' })
  @ValidateNested({ each: true })
  @Type(() => QuestionPreferenceDto)
  question_preference?: QuestionPreferenceDto[];

  /**
   * Custom validation: Both context (attachments OR prompt) AND question_preference must be provided
   */
  @Validate(HasContextAndQuestionPreferenceConstraint)
  _validateContextAndQuestionPreference?: any;
}

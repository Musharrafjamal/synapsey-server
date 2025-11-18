import { IsEnum, IsInt, IsNotEmpty, Max, Min } from 'class-validator';
import { QuestionType, QuestionDifficulty } from '../../schemas/ai-listener/chat';

/**
 * DTO for question preference configuration
 */
export class QuestionPreferenceDto {
  /** Type of question to generate */
  @IsEnum(QuestionType, { message: 'Question type must be one of: long, mcq, true_false' })
  @IsNotEmpty({ message: 'Question type is required' })
  ques_type: QuestionType;

  /** Number of questions to generate (1-100) */
  @IsInt({ message: 'Question count must be an integer' })
  @Min(1, { message: 'Question count must be at least 1' })
  @Max(100, { message: 'Question count cannot exceed 100' })
  @IsNotEmpty({ message: 'Question count is required' })
  ques_count: number;

  /** Difficulty level of questions */
  @IsEnum(QuestionDifficulty, { message: 'Question difficulty must be one of: easy, medium, hard' })
  @IsNotEmpty({ message: 'Question difficulty is required' })
  ques_difficulty: QuestionDifficulty;
}


import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Document } from 'mongoose';

export type ChatDocument = HydratedDocument<AiListenerChat>;

/**
 * Chat status enum
 * @enum {string}
 */
export enum ChatStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

/**
 * Question type enum
 * @enum {string}
 */
export enum QuestionType {
  LONG = 'long',
  MCQ = 'mcq',
  TRUE_FALSE = 'true_false',
}

/**
 * Question difficulty enum
 * @enum {string}
 */
export enum QuestionDifficulty {
  EASY = 'easy',
  MEDIUM = 'medium',
  HARD = 'hard',
}

/**
 * Question preference configuration
 * @interface
 */
export interface QuestionPreference {
  /** Type of question to generate */
  ques_type: QuestionType;
  /** Number of questions to generate (1-100) */
  ques_count: number;
  /** Difficulty level of questions */
  ques_difficulty: QuestionDifficulty;
}

/**
 * Chat context containing attachments and prompt
 * @interface
 */
export interface ChatContext {
  /** Array of image attachment URLs */
  attachments: string[];
  /** Extracted content from attachments using Google Vision API */
  attachment_content?: string[];
  /** Context prompt for the AI (max 10000 characters) */
  prompt: string;
}

/**
 * Chat settings configuration
 * @interface
 */
export interface ChatSettings {
  /** Chat title (max 200 characters) */
  title?: string;
  /** Total tokens used in this chat */
  token_used: number;
  /** Chat context with attachments and prompt */
  context: ChatContext;
  /** Question generation preferences */
  question_preference?: QuestionPreference[];
}

/**
 * AI Listener Chat Schema
 * Represents a chat conversation between a user and AI
 * @class
 */
@Schema({
  timestamps: true,
  collection: 'ai-listener-chats',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  id: false,
})
export class AiListenerChat extends Document {
  /** Reference to the user who owns this chat */
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: mongoose.Schema.Types.ObjectId;

  /** Current status of the chat */
  @Prop({
    type: String,
    enum: Object.values(ChatStatus),
    default: ChatStatus.ACTIVE,
    index: true,
  })
  status: ChatStatus;

  /** Chat settings and configuration */
  @Prop({
    type: {
      title: {
        type: String,
        maxlength: [200, 'Title cannot exceed 200 characters'],
        trim: true,
      },
      token_used: {
        type: Number,
        min: [0, 'Token count cannot be negative'],
        default: 0,
      },
      context: {
        type: {
          attachments: {
            type: [String],
            default: [],
            validate: {
              validator: function (attachments: string[]) {
                return attachments.length <= 20; // Limit attachments per message
              },
              message: 'Maximum 10 attachments allowed per message',
            },
          },
          attachment_content: {
            type: [String],
            default: [],
          },
          prompt: {
            type: String,
            maxlength: [10000, 'Prompt cannot exceed 10000 characters'],
            default: '',
            trim: true,
          },
        },
        required: false,
        _id: false,
        default: () => ({
          attachments: [],
          attachment_content: [],
          prompt: '',
        }),
      },
      question_preference: {
        type: [
          {
            ques_type: {
              type: String,
              enum: {
                values: Object.values(QuestionType),
                message: 'Invalid question type',
              },
              required: [true, 'Question type is required'],
            },
            ques_count: {
              type: Number,
              min: [1, 'Question count must be at least 1'],
              max: [100, 'Question count cannot exceed 100'],
              required: [true, 'Question count is required'],
            },
            ques_difficulty: {
              type: String,
              enum: {
                values: Object.values(QuestionDifficulty),
                message: 'Invalid question difficulty',
              },
              required: [true, 'Question difficulty is required'],
            },
          },
        ],
        default: [],
        _id: false,
      },
    },
    required: true,
    _id: false,
    default: () => ({
      title: 'New Chat',
      token_used: 0,
      context: {
        attachments: [],
        prompt: '',
      },
      question_preference: [],
    }),
  })
  settings: ChatSettings;

  /** Array of message IDs associated with this chat */
  @Prop({
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'AiListenerMessage',
    default: [],
  })
  messages: mongoose.Schema.Types.ObjectId[];
}

export const ChatSchema = SchemaFactory.createForClass(AiListenerChat);

// Compound indexes for common query patterns
ChatSchema.index({ user: 1, status: 1 }); // Find active chats for a user
ChatSchema.index({ user: 1, createdAt: -1 }); // Find recent chats for a user
ChatSchema.index({ status: 1, updatedAt: -1 }); // Find recently updated chats by status

// Ensure virtual fields are included in JSON output
ChatSchema.set('toJSON', { virtuals: true });
ChatSchema.set('toObject', { virtuals: true });

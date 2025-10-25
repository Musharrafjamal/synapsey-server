import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Document } from 'mongoose';

export type MessageDocument = HydratedDocument<AiListenerMessage>;

// Message sender type enum
export enum MessageSenderType {
  USER = 'user',
  AI = 'ai',
  SYSTEM = 'system',
}

// Message status enum
export enum MessageStatus {
  SENT = 'sent',
  COMPLETED = 'completed',
  FAILED = 'failed',
  GENERATING = 'generating',
}

// Message interface with enhanced structure
export interface MessageData {
  senderType: MessageSenderType;
  content: string;
  status: MessageStatus;
  metadata?: {
    model?: string; // AI model used
    tokens?: number; // Token count for AI responses
    processingTime?: number; // Processing time in ms
    error?: string; // Error message if failed
    parentMessageId?: string; // For threaded conversations
  };
  createdAt: Date;
  updatedAt: Date;
}

@Schema({
  timestamps: true,
  collection: 'ai-listener-messages',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  id: false,
})
export class AiListenerMessage extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AiListenerChat',
    required: true,
    index: true,
  })
  chat: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: String,
    enum: MessageSenderType,
    required: true,
    index: true,
  })
  senderType: MessageSenderType;

  @Prop({
    type: String,
    required: true,
    maxlength: 10000, // Limit message length
  })
  content: string;

  @Prop({
    type: [String],
    default: [],
    validate: {
      validator: function (attachments: string[]) {
        return attachments.length <= 10; // Limit attachments per message
      },
      message: 'Maximum 10 attachments allowed per message',
    },
  })
  attachments: string[];

  @Prop({
    type: String,
    enum: MessageStatus,
    default: MessageStatus.SENT,
    index: true,
  })
  status: MessageStatus;

  @Prop({
    type: {
      model: { type: String, required: false },
      tokens: { type: Number, required: false },
      processingTime: { type: Number, required: false },
      error: { type: String, required: false },
    },
    required: false,
  })
  metadata?: {
    model?: string;
    tokens?: number;
    processingTime?: number;
    error?: string;
  };
}

export const MessageSchema = SchemaFactory.createForClass(AiListenerMessage);

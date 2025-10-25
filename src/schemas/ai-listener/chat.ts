import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { HydratedDocument, Document } from 'mongoose';

export type ChatDocument = HydratedDocument<AiListenerChat>;

// Chat status enum
export enum ChatStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  DELETED = 'deleted',
}

// Chat settings interface
export interface ChatSettings {
  title?: string;
  temperature: number; // AI response temperature
  token_used: number; // Max tokens per response
}

// Main Chat schema
@Schema({
  timestamps: true,
  collection: 'ai-listener-chats',
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  id: false,
})
export class AiListenerChat extends Document {
  @Prop({
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: mongoose.Schema.Types.ObjectId;

  @Prop({
    type: String,
    enum: ChatStatus,
    default: ChatStatus.ACTIVE,
    index: true,
  })
  status: ChatStatus;

  @Prop({
    type: {
      title: { type: String, maxlength: 200 },
      temperature: { type: Number, min: 0, max: 2 },
      token_used: { type: Number },
    },
    default: {
      title: 'New Chat',
      temperature: 0.7,
      token_used: 0,
    },
  })
  settings: ChatSettings;

  @Prop({
    type: [mongoose.Schema.Types.ObjectId],
    ref: 'AiListenerMessage',
    default: [],
  })
  messages: mongoose.Schema.Types.ObjectId[];
}

export const ChatSchema = SchemaFactory.createForClass(AiListenerChat);

// Ensure virtual fields are included in JSON output
ChatSchema.set('toJSON', { virtuals: true });
ChatSchema.set('toObject', { virtuals: true });

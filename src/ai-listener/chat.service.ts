import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiListenerChat, ChatDocument, ChatStatus } from '../schemas/ai-listener/chat';
import { AiListenerMessage, MessageDocument } from '../schemas/ai-listener/message';
import { User, UserDocument } from '../schemas/user';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { AiListenerService } from './ai-listener.service';
import { UploadOptions, UploadUtils } from '../s3/upload.utils';
import { ImageType } from '../schemas/image';
import { S3Service } from '../s3/s3.service';
import { ImageService } from '../s3/image.service';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(AiListenerChat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(AiListenerMessage.name) private readonly messageModel: Model<MessageDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly aiListenerService: AiListenerService,
    private readonly s3Service: S3Service,
    private readonly imageService: ImageService,
  ) {}

  /**
   * Create a new chat for a user
   */
  async createChat(userId: string, createChatDto: CreateChatDto): Promise<ChatDocument> {
    try {
      // Verify user exists
      const user = await this.userModel.findById(userId);
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Create new chat
      const chat = new this.chatModel({
        user: userId,
        status: ChatStatus.ACTIVE,
        settings: {
          title: createChatDto.title || 'New Chat',
          temperature: createChatDto.temperature || 0.7,
        },
        messages: [],
      });

      const savedChat = await chat.save();

      // Add chat to user's chat list
      await this.userModel.findByIdAndUpdate(
        userId,
        { $push: { 'chats.ai_listener_chats': savedChat._id } },
        { new: true },
      );

      return savedChat;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to create chat: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get all chats for a user
   */
  async getUserChats(userId: string): Promise<ChatDocument[]> {
    try {
      const user = await this.userModel
        .findById(userId)
        .populate('chats.ai_listener_chats')
        .exec();

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return user.chats.ai_listener_chats as ChatDocument[];
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to get user chats: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get a specific chat by ID
   */
  async getChat(chatId: string, userId: string): Promise<ChatDocument> {
    try {
      const chat = await this.chatModel
        .findOne({ _id: chatId, user: userId, status: { $ne: ChatStatus.DELETED } })
        .populate({
          path: 'messages',
          options: { sort: { createdAt: 1 } },
        })
        .exec();

      if (!chat) {
        throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
      }

      return chat;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to get chat: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Send a message with file attachments in a chat
   */
  async sendMessage(
    chatId: string,
    userId: string,
    sendMessageData: SendMessageDto,
  ): Promise<{ message: MessageDocument; aiResponse: MessageDocument }> {
    try {
      // Verify chat belongs to user
      const chat = await this.chatModel.findOne({
        _id: chatId,
        user: userId,
        status: { $ne: ChatStatus.DELETED },
      });

      if (!chat) {
        throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
      }

      // Upload attachments if any
      let attachmentUrls: string[] = [];
      if (sendMessageData.attachments && sendMessageData.attachments.length > 0) {
        attachmentUrls = await this.uploadAttachments(sendMessageData.attachments, userId);
      }

      // Send message using AI service with uploaded attachment URLs
      const result = await this.aiListenerService.sendMessage(
        chatId,
        sendMessageData.content,
        attachmentUrls,
      );

      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to send message: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Upload multiple attachments and return their URLs
   */
  private async uploadAttachments(
    files: Express.Multer.File[],
    userId: string,
  ): Promise<string[]> {
    const uploadPromises = files.map(async (file) => {
      const uploadOptions: UploadOptions = {
        folder: 'chat-attachments',
        imageType: ImageType.DOCUMENT,
        uploadedBy: userId,
        maxFileSize: UploadUtils.mbToBytes(5), // 5MB max for chat attachments
      };

      const uploadResult = await UploadUtils.uploadFile(
        file,
        this.s3Service,
        this.imageService,
        uploadOptions,
      );

      return uploadResult.url;
    });

    return Promise.all(uploadPromises);
  }

  /**
   * Update chat settings
   */
  async updateChat(
    chatId: string,
    userId: string,
    updateChatDto: UpdateChatDto,
  ): Promise<ChatDocument> {
    try {
      const updateData: any = {};

      if (updateChatDto.title !== undefined) {
        updateData['settings.title'] = updateChatDto.title;
      }

      if (updateChatDto.temperature !== undefined) {
        updateData['settings.temperature'] = updateChatDto.temperature;
      }
      if (updateChatDto.status !== undefined) {
        updateData.status = updateChatDto.status;
      }

      const chat = await this.chatModel.findOneAndUpdate(
        { _id: chatId, user: userId, status: { $ne: ChatStatus.DELETED } },
        { $set: updateData },
        { new: true },
      );

      if (!chat) {
        throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
      }

      return chat;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to update chat: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Delete a chat (soft delete)
   */
  async deleteChat(chatId: string, userId: string): Promise<{ message: string }> {
    try {
      const chat = await this.chatModel.findOneAndUpdate(
        { _id: chatId, user: userId, status: { $ne: ChatStatus.DELETED } },
        { status: ChatStatus.DELETED },
        { new: true },
      );

      if (!chat) {
        throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
      }

      // Remove chat from user's chat list
      await this.userModel.findByIdAndUpdate(
        userId,
        { $pull: { 'chats.ai_listener_chats': chatId } },
        { new: true },
      );

      return { message: 'Chat deleted successfully' };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to delete chat: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}

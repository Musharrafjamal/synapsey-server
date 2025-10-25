import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AiListenerChat, ChatDocument } from '../schemas/ai-listener/chat';
import { AiListenerMessage, MessageDocument, MessageSenderType, MessageStatus } from '../schemas/ai-listener/message';

@Injectable()
export class AiListenerService {
  private readonly openRouterApiKey: string;
  private readonly openRouterBaseUrl = 'https://openrouter.ai/api/v1';

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(AiListenerChat.name) private readonly chatModel: Model<ChatDocument>,
    @InjectModel(AiListenerMessage.name) private readonly messageModel: Model<MessageDocument>,
  ) {
    this.openRouterApiKey =
      this.configService.get<string>('OPENROUTER_API_KEY');
    if (!this.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
  }

  async askQuestion(question: string): Promise<{ response: string }> {
    try {
      const response = await fetch(
        `${this.openRouterBaseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000', // Optional: replace with your app's URL
            'X-Title': 'Synapsy AI', // Optional: replace with your app's name
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash-lite', // You can change this to any supported model
            messages: [
              {
                role: 'user',
                content: question,
              },
            ],
            max_tokens: 1000,
            temperature: 0.7,
            usage: {include: true},
            provider: {
              sort: 'price',
            },
          }),
        },
      );

      if (!response.ok) {
        throw new HttpException(
          `OpenRouter API error: ${response.status} ${response.statusText}`,
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();

      if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new HttpException(
          'Invalid response format from OpenRouter API',
          HttpStatus.BAD_GATEWAY,
        );
      }

      return {
        response: data.choices[0].message.content,
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        `Failed to process question: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async sendMessage(
    chatId: string,
    content: string,
    attachments?: string[],
  ): Promise<{ message: MessageDocument; aiResponse: MessageDocument }> {
    const startTime = Date.now();

    try {
      // Get chat with messages for context
      const chat = await this.chatModel
        .findById(chatId)
        .populate('messages')
        .exec();

      if (!chat) {
        throw new HttpException('Chat not found', HttpStatus.NOT_FOUND);
      }

      // Create user message
      const userMessage = new this.messageModel({
        chat: chatId,
        senderType: MessageSenderType.USER,
        content,
        attachments: attachments || [],
        status: MessageStatus.SENT,
      });

      await userMessage.save();

      // Add user message to chat
      chat.messages.push(userMessage._id as any);
      await chat.save();

      // Get recent messages for context (last 10 messages)
      const recentMessages = await this.messageModel
        .find({ chat: chatId })
        .sort({ createdAt: -1 })
        .limit(10)
        .exec();

      // Build conversation history for AI
      const conversationHistory = recentMessages
        .reverse()
        .map((msg) => ({
          role: msg.senderType === MessageSenderType.USER ? 'user' : 'assistant',
          content: msg.content,
        }));

      // Add current user message
      conversationHistory.push({
        role: 'user',
        content,
      });

      // Call AI API with context
      const aiResponse = await this.callOpenRouterAPI(
        conversationHistory,
        chat.settings,
      );

      // Create AI message
      const aiMessage = new this.messageModel({
        chat: chatId,
        senderType: MessageSenderType.AI,
        content: aiResponse.content,
        status: MessageStatus.COMPLETED,
        metadata: {
          model: aiResponse.model,
          tokens: aiResponse.usage?.total_tokens,
          processingTime: Date.now() - startTime,
        },
      });

      await aiMessage.save();

      // Add AI message to chat
      chat.messages.push(aiMessage._id as any);
      await chat.save();

      return {
        message: userMessage,
        aiResponse: aiMessage,
      };
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

  private async callOpenRouterAPI(
    messages: Array<{ role: string; content: string }>,
    chatSettings: any,
  ): Promise<{
    content: string;
    model: string;
    usage?: { total_tokens: number };
  }> {
    const response = await fetch(
      `${this.openRouterBaseUrl}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.openRouterApiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Synapsy AI',
        },
        body: JSON.stringify({
          model: chatSettings.ai_model || 'google/gemini-2.5-flash-lite',
          messages,
          max_tokens: chatSettings.token_used || 1000,
          temperature: chatSettings.temperature || 0.7,
          usage: { include: true },
          provider: {
            sort: 'price',
          },
        }),
      },
    );

    if (!response.ok) {
      throw new HttpException(
        `OpenRouter API error: ${response.status} ${response.statusText}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    const data = await response.json();

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new HttpException(
        'Invalid response format from OpenRouter API',
        HttpStatus.BAD_GATEWAY,
      );
    }

    return {
      content: data.choices[0].message.content,
      model: data.model,
      usage: data.usage,
    };
  }
}

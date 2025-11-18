import { 
  Body, 
  Controller, 
  HttpCode, 
  HttpStatus, 
  Post, 
  Get, 
  Put, 
  Delete, 
  Param, 
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  HttpException
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AiListenerService } from './ai-listener.service';
import { ChatService } from './chat.service';
import { AskQuestionDto } from './dto/ask-question.dto';
import { CreateChatDto } from './dto/create-chat.dto';
import { UpdateChatDto } from './dto/update-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('ai-listener')
@UseGuards(JwtAuthGuard)
export class AiListenerController {
  constructor(
    private readonly aiListenerService: AiListenerService,
    private readonly chatService: ChatService,
  ) {}

  @Post('ask')
  @HttpCode(HttpStatus.OK)
  async askQuestion(@Body() askQuestionDto: AskQuestionDto) {
    return this.aiListenerService.askQuestion(askQuestionDto.message);
  }

  // Chat Management Routes

  @Post('chats')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('attachments', 20)) // Allow up to 20 files (matching schema limit)
  async createChat(
    @Request() req: any,
    @Body() body: any,
    @UploadedFiles() attachments?: Express.Multer.File[],
  ) {
    const userId = req.user.id as string;
    
    // Parse question_preference if it's a string (from form-data)
    let question_preference = body.question_preference;
    if (typeof question_preference === 'string') {
      try {
        // Try to parse as JSON
        question_preference = JSON.parse(question_preference);
      } catch {
        // If parsing fails, try to handle invalid JSON format
        throw new HttpException(
          'Invalid question_preference format. Expected valid JSON array, e.g., [{"ques_type":"mcq","ques_count":10,"ques_difficulty":"easy"}]',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    // Ensure question_preference is an array
    if (question_preference && !Array.isArray(question_preference)) {
      // If it's a single object, convert to array
      if (typeof question_preference === 'object') {
        question_preference = [question_preference];
      } else {
        question_preference = undefined;
      }
    }

    const createChatDto: CreateChatDto = {
      title: body.title,
      prompt: body.prompt,
      attachments: attachments || [],
      question_preference: question_preference,
    };

    return this.chatService.createChat(userId, createChatDto);
  }

  @Get('chats')
  @HttpCode(HttpStatus.OK)
  async getUserChats(@Request() req: any) {
    const userId = req.user.id as string;
    return this.chatService.getUserChats(userId);
  }

  @Get('chats/:chatId')
  @HttpCode(HttpStatus.OK)
  async getChat(
    @Request() req: any,
    @Param('chatId') chatId: string,
  ) {
    const userId = req.user.id as string;
    return this.chatService.getChat(chatId, userId);
  }

  @Post('chats/:chatId/messages')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FilesInterceptor('attachments', 6)) // Allow up to 10 files
  async sendMessage(
    @Request() req: any,
    @Param('chatId') chatId: string,
    @Body() body: { content: string },
    @UploadedFiles() attachments?: Express.Multer.File[],
  ) {
    const userId = req.user.id as string;
    const sendMessageData: SendMessageDto = {
      content: body.content,
      attachments: attachments || [],
    };
    return await this.chatService.sendMessage(chatId, userId, sendMessageData);
  }

  @Put('chats/:chatId')
  @HttpCode(HttpStatus.OK)
  async updateChat(
    @Request() req: any,
    @Param('chatId') chatId: string,
    @Body() updateChatDto: UpdateChatDto,
  ) {
    const userId = req.user.id as string;
    return this.chatService.updateChat(chatId, userId, updateChatDto);
  }

  @Delete('chats/:chatId')
  @HttpCode(HttpStatus.OK)
  async deleteChat(
    @Request() req: any,
    @Param('chatId') chatId: string,
  ) {
    const userId = req.user.id as string;
    return this.chatService.deleteChat(chatId, userId);
  }
}

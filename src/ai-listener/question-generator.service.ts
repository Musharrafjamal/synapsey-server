import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QuestionPreferenceDto } from './dto/question-preference.dto';

@Injectable()
export class QuestionGeneratorService {
  private readonly openRouterApiKey: string;
  private readonly openRouterBaseUrl = 'https://openrouter.ai/api/v1';

  constructor(private readonly configService: ConfigService) {
    this.openRouterApiKey =
      this.configService.get<string>('OPENROUTER_API_KEY');
    if (!this.openRouterApiKey) {
      throw new Error('OPENROUTER_API_KEY is not configured');
    }
  }

  /**
   * Generate questions based on prompt, attachments, and preferences
   */
  async generateQuestions(
    prompt: string | undefined,
    attachmentContent: string[],
    preferences: QuestionPreferenceDto[],
  ): Promise<string> {
    try {
      // 1. Construct System Prompt
      const systemPrompt = this.buildSystemPrompt(preferences);

      // 2. Construct User Prompt based on cases
      const userPrompt = this.buildUserPrompt(prompt, attachmentContent);

      // 3. Call OpenRouter API
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
            model: 'google/gemini-2.5-flash-lite', // Using a capable model
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: userPrompt },
            ],
            temperature: 0.7,
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

      return data.choices[0].message.content;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        `Failed to generate questions: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private buildSystemPrompt(preferences: QuestionPreferenceDto[]): string {
    let prompt = `You are an expert educational AI assistant. Your task is to generate questions based on the provided context and preferences.
    
    Please generate the following questions:`;

    preferences.forEach((pref) => {
      prompt += `\n- ${pref.ques_count} ${pref.ques_difficulty} ${pref.ques_type} questions`;
    });

    prompt += `\n\nOutput Format:
    Provide the questions in a clear, structured format. 
    For MCQs, include the options and the correct answer.
    For True/False, include the correct answer.
    For Long questions, provide the question text.
    
    Do not include any conversational filler. Just the questions.`;

    return prompt;
  }

  private buildUserPrompt(
    prompt: string | undefined,
    attachmentContent: string[],
  ): string {
    const hasPrompt = prompt && prompt.trim().length > 0;
    const hasAttachments = attachmentContent && attachmentContent.length > 0;

    let userPrompt = '';

    if (hasPrompt && !hasAttachments) {
      // Case 1: Only prompt available
      userPrompt = `Generate questions based on the following topic/instruction:\n\n${prompt}`;
    } else if (!hasPrompt && hasAttachments) {
      // Case 2: Attachment content available
      userPrompt = `Generate questions based on the following content:\n\n${attachmentContent.join('\n\n')}`;
    } else if (hasPrompt && hasAttachments) {
      // Case 3: Both attachment content and prompt available
      userPrompt = `Context Content:\n${attachmentContent.join('\n\n')}\n\nInstruction:\nGenerate questions based on the above content, but specifically focusing on: ${prompt}`;
    } else {
      // Should not happen due to validation, but safe fallback
      userPrompt =
        'Generate general knowledge questions based on the preferences.';
    }

    return userPrompt;
  }
}

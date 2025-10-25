import { BaseEmailTemplate, BaseEmailData } from './base-template';

export interface WelcomeEmailData extends BaseEmailData {
  recipientName: string;
  loginMethod: 'google' | 'email';
}

export class WelcomeEmailTemplate extends BaseEmailTemplate {
  protected getContent(data: WelcomeEmailData): string {
    const loginMethodText = data.loginMethod === 'google' ? 'Google account' : 'email and password';
    
    return `
      <h2>Welcome to Synapsy, ${data.recipientName}! 🎉</h2>
      <p>We're thrilled to have you join our community of AI enthusiasts!</p>
      <p>You've successfully created your account using your ${loginMethodText}.</p>
      <p>Get ready to explore the amazing world of AI-powered assistance that's available 24/7.</p>
      <p>If you have any questions or need help getting started, our support team is here for you!</p>
    `;
  }

  generateWelcomeEmail(data: WelcomeEmailData): string {
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Welcome to Synapsy! 🎉',
      actionButton: {
        text: 'Get Started',
        url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`,
        color: 'linear-gradient(135deg, #667eea 0%, #687FE5 100%)'
      }
    };

    return this.generateEmail(emailData);
  }
}

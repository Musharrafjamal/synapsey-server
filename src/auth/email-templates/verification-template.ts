import { BaseEmailTemplate, BaseEmailData } from './base-template';

export interface VerificationEmailData extends BaseEmailData {
  recipientName?: string;
  verificationToken: string;
  expirationHours?: number;
}

export class VerificationEmailTemplate extends BaseEmailTemplate {
  protected getContent(data: VerificationEmailData): string {
    const expirationHours = data.expirationHours || 24;
    const name = data.recipientName ? `, ${data.recipientName}` : '';
    
    return `
      <h2>Verify Your Email Address ✉️</h2>
      <p>Hello${name}!</p>
      <p>Thank you for signing up with Synapsy. To complete your registration, please verify your email address by clicking the button below.</p>
      <p>This verification link will expire in <strong>${expirationHours} hours</strong> for security reasons.</p>
      <p>If you didn't create an account with Synapsy, you can safely ignore this email.</p>
    `;
  }

  generateVerificationEmail(data: VerificationEmailData): string {
    const verificationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/verify-email?token=${data.verificationToken}`;
    
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Verify Your Email - Synapsy',
      actionButton: {
        text: 'Verify Email Address',
        url: verificationUrl,
        color: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)'
      }
    };

    return this.generateEmail(emailData);
  }
}

import { BaseEmailTemplate, BaseEmailData } from './base-template';

export interface PasswordResetEmailData extends BaseEmailData {
  recipientName?: string;
  resetToken: string;
  expirationHours?: number;
}

export class PasswordResetEmailTemplate extends BaseEmailTemplate {
  protected getContent(data: PasswordResetEmailData): string {
    const expirationHours = data.expirationHours || 1;
    const name = data.recipientName ? `, ${data.recipientName}` : '';
    
    return `
      <h2>Reset Your Password 🔐</h2>
      <p>Hello${name}!</p>
      <p>We received a request to reset your password for your Synapsy account.</p>
      <p>Click the button below to create a new password. This link will expire in <strong>${expirationHours} hour${expirationHours > 1 ? 's' : ''}</strong>.</p>
      <p><strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email and ensure your account is secure.</p>
      <p>Your current password will remain unchanged until you complete the reset process.</p>
    `;
  }

  generatePasswordResetEmail(data: PasswordResetEmailData): string {
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${data.resetToken}`;
    
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Reset Your Password - Synapsy',
      actionButton: {
        text: 'Reset Password',
        url: resetUrl,
        color: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)'
      }
    };

    return this.generateEmail(emailData);
  }

  generatePasswordResetSuccessEmail(data: BaseEmailData): string {
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Password Reset Successfully - Synapsy',
      actionButton: undefined // No action button for success email
    };

    return this.generateEmail(emailData);
  }
}

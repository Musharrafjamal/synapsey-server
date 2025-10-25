import { BaseEmailTemplate, BaseEmailData } from './base-template';

export interface CustomEmailData extends BaseEmailData {
  recipientName?: string;
  customTitle?: string;
  customContent: string;
  showActionButton?: boolean;
  actionButtonText?: string;
  actionButtonUrl?: string;
  actionButtonColor?: string;
}

export class CustomEmailTemplate extends BaseEmailTemplate {
  protected getContent(data: CustomEmailData): string {
    const greeting = data.recipientName ? `Hello ${data.recipientName}!` : 'Hello!';
    const title = data.customTitle || 'Message from Synapsy';
    
    return `
      <h2>${title}</h2>
      <p>${greeting}</p>
      ${data.customContent}
    `;
  }

  generateCustomEmail(data: CustomEmailData): string {
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Message from Synapsy',
      actionButton: data.showActionButton && data.actionButtonText && data.actionButtonUrl ? {
        text: data.actionButtonText,
        url: data.actionButtonUrl,
        color: data.actionButtonColor || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
      } : undefined
    };

    return this.generateEmail(emailData);
  }

  /**
   * Generate a simple notification email without action button
   */
  generateNotificationEmail(data: Omit<CustomEmailData, 'showActionButton' | 'actionButtonText' | 'actionButtonUrl' | 'actionButtonColor'>): string {
    return this.generateCustomEmail({
      ...data,
      showActionButton: false
    });
  }

  /**
   * Generate an informational email with custom styling
   */
  generateInfoEmail(data: CustomEmailData): string {
    const emailData: BaseEmailData = {
      ...data,
      subject: data.subject || 'Information from Synapsy',
      actionButton: data.actionButton
    };

    return this.generateEmail(emailData);
  }
}

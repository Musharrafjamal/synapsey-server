import { companyName } from 'src/const/brand';
import { go_to_app_link } from 'src/const/links';
import { email_verify_gif } from 'src/const/media';
import { BaseEmailTemplate, BaseEmailData } from './base-template';

export interface VerificationSuccessEmailData extends BaseEmailData {
  recipientName?: string;
  loginUrl?: string;
}

export class VerificationSuccessEmailTemplate extends BaseEmailTemplate {
  protected getContent(data: VerificationSuccessEmailData): string {
    const name = data.recipientName || 'there';

    return `
      <div style="text-align: center; max-width: 500px; margin: 0 auto;">
        <!-- Animated Email GIF on White Background -->
        <div style="
          background: #ffffff;
          padding: 20px;
        ">
          <img 
            src="${email_verify_gif}" 
            alt="Email Verification Success" 
            style="
              width: 120px; 
              height: 120px; 
              display: block;
              margin: 0 auto;
            "
          />
        </div>

        <!-- Success Message -->
        <h1 style="
          font-size: 28px; 
          font-weight: 800; 
          color: #1f2937; 
          margin: 0 0 16px 0;
          line-height: 1.2;
        ">
          🎉 Email Successfully Verified!
        </h1>

        <!-- Personalized Greeting -->
        <p style="
          font-size: 18px; 
          color: #4b5563; 
          margin: 0 0 30px 0;
          line-height: 1.6;
        ">
          Hello <strong style="color: #615fff;">${name}</strong>, 
          <br>welcome to ${companyName}!
        </p>

        <!-- What's Next Section -->
        <div style="
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 24px;
          margin: 30px 0;
          text-align: left;
        ">
          <h3 style="
            font-size: 18px; 
            font-weight: 700; 
            color:rgb(22, 22, 22); 
            margin: 0 0 16px 0;
          ">
           
            What's Next?
          </h3>
          
          <ul style="
            margin: 0;
            padding-left: 20px;
            color:rgb(66, 66, 66);
            line-height: 1.6;
            font-size: 15px;
          ">
            <li style="margin-bottom: 8px;">Update your profile</li>
            <li style="margin-bottom: 8px;">Explore AI-powered features</li>
            <li style="margin-bottom: 0;">Start your first AI conversation</li>
          </ul>
        </div>

        <!-- Continue to App Button -->
        <div style="
          background: #615fff;
          padding: 20px;
          border-radius: 16px;
          margin: 10px 0;
          box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
        ">
          <h3 style="
            color: white; 
            margin: 0 0 16px 0; 
            font-size: 20px;
            font-weight: 700;
          ">
            Ready to Get Started?
          </h3>
          <p style="
            color: rgba(255, 255, 255, 0.9); 
            margin: 0 0 20px 0;
            font-size: 16px;
            line-height: 1.5;
          ">
            Continue to your account and discover the power of AI.
          </p>
        </div>
      </div>
    `;
  }

  generateVerificationSuccessEmail(data: VerificationSuccessEmailData): string {
    const appUrl = data.loginUrl || go_to_app_link;
    const emailData: BaseEmailData = {
      ...data,
      subject:
        data.subject || '🎉 Email Verified Successfully - Welcome to Synapsy!',
      actionButton: {
        text: 'Continue to App',
        url: appUrl,
        color: 'linear-gradient(135deg, #615fff 0%,rgb(115, 79, 186) 100%)',
      },
    };

    return this.generateEmail(emailData);
  }
}

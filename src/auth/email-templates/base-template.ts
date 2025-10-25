import {
  instagramLogo,
  linkedinLogo,
  smallLogo,
  smallWhiteLogo,
  xLogo,
} from '../../const/brand';

export interface BaseEmailData {
  recipientName?: string;
  subject: string;
  content: string;
  actionButton?: {
    text: string;
    url: string;
    color?: string;
  };
  footerText?: string;
}

export abstract class BaseEmailTemplate {
  protected abstract getContent(data: BaseEmailData): string;

  /**
   * Generates the complete email HTML with Synapsy branding
   */
  generateEmail(data: BaseEmailData): string {
    const actionButtonHtml = data.actionButton
      ? this.generateActionButton(data.actionButton)
      : '';

    const content = this.getContent(data);

    return `
      <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${data.subject}</title>
          <!-- Import Google Font for tagline -->
          <link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              color: #333;
            }
            .email-container {
              max-width: 600px;
              margin: 20px auto;
              border-radius: 16px;
              overflow: hidden;
              background-color: #fff;
              box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            }
            /* Header */
            .header {
              background: #615fff;
              text-align: center;
              padding: 20px;
              border-radius: 16px 16px 0 0;
            }
            .header img {
              width: 60px;
              height: 60px;
              margin-bottom: 12px;
            }
            .brand-name {
              font-size: 28px;
              font-weight: 800;
              color: #fff;
            }
            .tagline {
              font-size: 12px;
              color: #fff;
              font-family: 'Press Start 2P', monospace;
              margin-top: 4px;
            }
            /* Content */
            .content {
              background: #fff;
              padding: 40px 20px;
              min-height: 200px;
              text-align: center;
            }
            /* Footer */
            .footer {
              background-color: #f5f5f5;
              text-align: center;
              padding: 30px 20px;
              border-radius: 0 0 16px 16px;
            }
            .footer img.logo {
              width: 50px;
              margin-bottom: 10px;
            }
            .footer .brand {
              font-size: 20px;
              font-weight: 700;
              color: #615fff;
            }
            .footer .tagline {
              font-size: 10px;
              color: #615fff;
              font-family: 'Press Start 2P', monospace;
              margin: 6px 0 16px;
            }
            .social-links {
              margin-bottom: 20px;
            }
            .social-links img {
              width: 28px;
              height: 28px;
              margin: 0 8px;
              vertical-align: middle;
            }
            .copyright {
              font-size: 12px;
              color: #777;
            }
            @media (max-width: 600px) {
              .brand-name { font-size: 24px; }
              .content { padding: 30px 15px; }
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <!-- Header -->
            <div class="header">
              <img src="${smallWhiteLogo}" alt="Synapsey Logo" />
              <div class="brand-name">SYNAPSEY</div>
              <div class="tagline">Your 24X7 AI Buddy</div>
            </div>

            <!-- Content -->
            <div class="content">
              ${content}
              ${actionButtonHtml}
            </div>

            <!-- Footer -->
            <div class="footer">
              <img src="${smallLogo}" alt="Synapsey Logo" class="logo"/>
              <div class="brand">SYNAPSEY</div>
              <div class="tagline">Your 24X7 AI Buddy</div>

              <div class="social-links">
                <a href="#"><img src="${xLogo}" alt="X Logo"/></a>
                <a href="#"><img src="${instagramLogo}" alt="Instagram Logo"/></a>
                <a href="#"><img src="${linkedinLogo}" alt="LinkedIn Logo"/></a>
              </div>

              <div class="copyright">©2025 Synapsey All rights reserved</div>
            </div>
          </div>
        </body>
        </html>
    `;
  }

  /**
   * Generates an action button with custom styling
   */
  private generateActionButton(button: {
    text: string;
    url: string;
    color?: string;
  }): string {
    const buttonColor =
      button.color || 'linear-gradient(135deg, #615fff 0%,rgb(115, 79, 186) 100%)';

    return `
      <div style="text-align: center;">
        <a href="${button.url}" 
           class="action-button" 
           style="background: ${buttonColor}; display: inline-block; padding: 14px 28px; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px; margin: 20px auto; text-align: center; transition: all 0.3s ease; box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);">
          ${button.text}
        </a>
      </div>
    `;
  }
}

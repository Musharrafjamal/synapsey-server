// Base template and interfaces
export { BaseEmailTemplate, BaseEmailData } from './base-template';

// Welcome email template
export { WelcomeEmailTemplate, WelcomeEmailData } from './welcome-template';

// Verification email template
export {
  VerificationEmailTemplate,
  VerificationEmailData,
} from './verification-template';

// Password reset email template
export {
  PasswordResetEmailTemplate,
  PasswordResetEmailData,
} from './password-reset-template';

// Custom email template
export { CustomEmailTemplate, CustomEmailData } from './custom-template';

// Verification success email template
export { VerificationSuccessEmailTemplate, VerificationSuccessEmailData } from './verification-success-template';

// Import the classes for the factory
import { WelcomeEmailTemplate } from './welcome-template';
import { VerificationEmailTemplate } from './verification-template';
import { PasswordResetEmailTemplate } from './password-reset-template';
import { CustomEmailTemplate } from './custom-template';
import { VerificationSuccessEmailTemplate } from './verification-success-template';

// Template factory for easy access
export class EmailTemplateFactory {
  static createWelcomeTemplate(): WelcomeEmailTemplate {
    return new WelcomeEmailTemplate();
  }

  static createVerificationTemplate(): VerificationEmailTemplate {
    return new VerificationEmailTemplate();
  }

  static createPasswordResetTemplate(): PasswordResetEmailTemplate {
    return new PasswordResetEmailTemplate();
  }

  static createCustomTemplate(): CustomEmailTemplate {
    return new CustomEmailTemplate();
  }

  static createVerificationSuccessTemplate(): VerificationSuccessEmailTemplate {
    return new VerificationSuccessEmailTemplate();
  }
}

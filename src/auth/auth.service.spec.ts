import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthUserService } from './auth-user.service';
import { EmailService } from './email.service';
import { AuthMethod, UserStatus } from '../schemas/user';
import { LoginMethod } from './dto/login.dto';

describe('AuthService', () => {
  let service: AuthService;

  const mockAuthUserService = {
    findByEmail: jest.fn(),
    createGoogleUser: jest.fn(),
    createEmailUser: jest.fn(),
    updateGoogleUserMetadata: jest.fn(),
    verifyPassword: jest.fn(),
    profileById: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockEmailService = {
    sendWelcomeEmail: jest.fn(),
    sendCustomEmail: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: AuthUserService,
          useValue: mockAuthUserService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should handle Google OAuth login for existing user', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'test@example.com', name: 'Test User', avatar: null },
        auth: { method: AuthMethod.GOOGLE_OAUTH },
        status: UserStatus.ACTIVE,
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);
      mockAuthUserService.updateGoogleUserMetadata.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login({
        loginVia: LoginMethod.GOOGLE,
        email: 'test@example.com',
        metadata: { name: 'Test User' },
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should handle Google OAuth login for new user', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'new@example.com', name: 'New User', avatar: null },
        auth: { method: AuthMethod.GOOGLE_OAUTH },
        status: UserStatus.ACTIVE,
      };

      mockAuthUserService.findByEmail.mockResolvedValue(null);
      mockAuthUserService.createGoogleUser.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('jwt-token');
      mockEmailService.sendWelcomeEmail.mockResolvedValue(true);

      const result = await service.login({
        loginVia: LoginMethod.GOOGLE,
        email: 'new@example.com',
        metadata: { name: 'New User', uuid: 'google-uuid' },
      });

      expect(result.success).toBe(true);
      expect(mockAuthUserService.createGoogleUser).toHaveBeenCalledWith('new@example.com', {
        name: 'New User',
        uuid: 'google-uuid',
      });
    });

    it('should handle email/password login for existing user', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'test@example.com', name: 'Test User', avatar: null },
        auth: { method: AuthMethod.EMAIL_PASSWORD, password: 'hashed-password' },
        status: UserStatus.ACTIVE,
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);
      mockAuthUserService.verifyPassword.mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue('jwt-token');

      const result = await service.login({
        loginVia: LoginMethod.EMAIL,
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(result.token).toBe('jwt-token');
      expect(result.user.email).toBe('test@example.com');
    });

    it('should handle email/password login for new user', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'new@example.com', name: 'Unknown User', avatar: null },
        auth: { method: AuthMethod.EMAIL_PASSWORD },
        status: UserStatus.PENDING_VERIFICATION,
      };

      mockAuthUserService.findByEmail.mockResolvedValue(null);
      mockAuthUserService.createEmailUser.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue('jwt-token');
      mockEmailService.sendWelcomeEmail.mockResolvedValue(true);

      const result = await service.login({
        loginVia: LoginMethod.EMAIL,
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.success).toBe(true);
      expect(mockAuthUserService.createEmailUser).toHaveBeenCalledWith('new@example.com', 'password123');
    });
  });

  describe('sendEmailVerification', () => {
    it('should send verification code successfully', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'test@example.com' },
        auth: { 
          email_verified: false,
          email_verification: null,
        },
        hasExceededVerificationAttempts: jest.fn().mockReturnValue(false),
        isVerificationCodeExpired: jest.fn().mockReturnValue(true),
        generateVerificationCode: jest.fn().mockImplementation(function() {
          this.auth.email_verification = { code: '123456' };
          return Promise.resolve();
        }),
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);
      mockEmailService.sendCustomEmail.mockResolvedValue(true);

      const result = await service.sendEmailVerification({ email: 'test@example.com' });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Verification code sent successfully');
      expect(mockUser.generateVerificationCode).toHaveBeenCalled();
    });

    it('should throw error if user not found', async () => {
      mockAuthUserService.findByEmail.mockResolvedValue(null);

      await expect(service.sendEmailVerification({ email: 'test@example.com' }))
        .rejects.toThrow('User with this email does not exist');
    });

    it('should throw error if email already verified', async () => {
      const mockUser = {
        auth: { email_verified: true },
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.sendEmailVerification({ email: 'test@example.com' }))
        .rejects.toThrow('Email is already verified');
    });

    it('should throw error if too many attempts', async () => {
      const mockUser = {
        auth: { email_verified: false },
        hasExceededVerificationAttempts: jest.fn().mockReturnValue(true),
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.sendEmailVerification({ email: 'test@example.com' }))
        .rejects.toThrow('Too many verification attempts. Please try again later.');
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const mockUser = {
        _id: 'user-id',
        user: { email: 'test@example.com', name: 'Test User' },
        auth: { email_verified: false },
        status: UserStatus.PENDING_VERIFICATION,
        verifyEmailCode: jest.fn().mockResolvedValue(true),
        hasExceededVerificationAttempts: jest.fn().mockReturnValue(false),
        isVerificationCodeExpired: jest.fn().mockReturnValue(false),
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.verifyEmail({ 
        email: 'test@example.com', 
        code: '123456' 
      });

      expect(result.success).toBe(true);
      expect(result.message).toBe('Email verified successfully');
      expect(mockUser.verifyEmailCode).toHaveBeenCalledWith('123456');
    });

    it('should throw error if user not found', async () => {
      mockAuthUserService.findByEmail.mockResolvedValue(null);

      await expect(service.verifyEmail({ 
        email: 'test@example.com', 
        code: '123456' 
      })).rejects.toThrow('User with this email does not exist');
    });

    it('should throw error if email already verified', async () => {
      const mockUser = {
        auth: { email_verified: true },
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.verifyEmail({ 
        email: 'test@example.com', 
        code: '123456' 
      })).rejects.toThrow('Email is already verified');
    });

    it('should throw error if verification code is invalid', async () => {
      const mockUser = {
        auth: { email_verified: false },
        verifyEmailCode: jest.fn().mockResolvedValue(false),
        hasExceededVerificationAttempts: jest.fn().mockReturnValue(false),
        isVerificationCodeExpired: jest.fn().mockReturnValue(false),
      };

      mockAuthUserService.findByEmail.mockResolvedValue(mockUser);

      await expect(service.verifyEmail({ 
        email: 'test@example.com', 
        code: '123456' 
      })).rejects.toThrow('Invalid verification code');
    });
  });
});

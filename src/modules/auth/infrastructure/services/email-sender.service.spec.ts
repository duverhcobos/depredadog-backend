import { ConfigService } from '@nestjs/config';
import { LoggerService } from '../../../../common/logger/logger.service';
import { EmailSenderService } from './email-sender.service';

describe('EmailSenderService', () => {
  let service: EmailSenderService;
  let logger: jest.Mocked<LoggerService>;
  let config: jest.Mocked<ConfigService>;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<LoggerService>;
    config = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;
    fetchSpy = jest.spyOn(global, 'fetch');
    service = new EmailSenderService(logger, config);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('sin API key en dev → loguea el código y no llama a la API', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'app.isProduction' ? false : null,
    );
    await service.sendVerificationCode('a@b.com', '123456');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('123456'),
      'EmailSenderService',
    );
  });

  it('sin API key en producción → lanza y el error no incluye código ni email', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'app.isProduction' ? true : null,
    );

    await expect(
      service.sendVerificationCode('a@b.com', '123456'),
    ).rejects.toThrow('Email delivery not configured');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.not.stringContaining('123456'),
      undefined,
      'EmailSenderService',
    );
    const errorMessage = logger.error.mock.calls[0][0];
    expect(errorMessage).not.toContain('123456');
    expect(errorMessage).not.toContain('a@b.com');
  });

  it('con API key → POST a la API de Resend', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'email.resendApiKey'
        ? 're_test'
        : 'Depredadog <onboarding@resend.dev>',
    );
    fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));

    await service.sendVerificationCode('a@b.com', '123456');

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer re_test',
        }),
      }),
    );
    const body = JSON.parse(
      (fetchSpy.mock.calls[0][1] as { body: string }).body,
    ) as { to: string; html: string };
    expect(body.to).toBe('a@b.com');
    expect(body.html).toContain('123456');
  });

  it('falla la API → lanza y loguea el error', async () => {
    config.get.mockImplementation((key: string) =>
      key === 'email.resendApiKey' ? 're_test' : 'from',
    );
    fetchSpy.mockResolvedValue(
      new Response('{"message":"invalid key"}', { status: 403 }),
    );

    await expect(
      service.sendVerificationCode('a@b.com', '123456'),
    ).rejects.toThrow('Email delivery failed: 403');
    expect(logger.error).toHaveBeenCalled();
  });
});

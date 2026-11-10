import { ArgumentsHost } from '@nestjs/common';
import { DomainException } from '../../exceptions/domain.exception';
import { DomainExceptionHandler } from './domain-exception.handler';

class CodedException extends DomainException {
  constructor() {
    super('Store is closed', 409, 'STORE_CLOSED');
  }
}

class CodelessException extends DomainException {
  constructor() {
    super('Order not found', 404);
  }
}

const host = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const res = { status };
  return {
    res,
    json,
    host: {
      switchToHttp: () => ({ getResponse: () => res }),
    } as unknown as ArgumentsHost,
  };
};

describe('DomainExceptionHandler', () => {
  const handler = new DomainExceptionHandler();

  it('emite errorCode cuando la excepción lo define', () => {
    const { host: h, json } = host();
    handler.handle(new CodedException(), h);
    const body = json.mock.calls[0][0];
    expect(body).toMatchObject({
      statusCode: 409,
      errorCode: 'STORE_CLOSED',
      message: 'Store is closed',
    });
    expect(body.timestamp).toEqual(expect.any(String));
  });

  it('omite errorCode cuando la excepción no lo define', () => {
    const { host: h, json } = host();
    handler.handle(new CodelessException(), h);
    const body = json.mock.calls[0][0];
    expect(body.statusCode).toBe(404);
    expect('errorCode' in body).toBe(false);
  });

  it('canHandle reconoce DomainException y rechaza el resto', () => {
    expect(handler.canHandle(new CodedException())).toBe(true);
    expect(handler.canHandle(new Error('x'))).toBe(false);
  });
});

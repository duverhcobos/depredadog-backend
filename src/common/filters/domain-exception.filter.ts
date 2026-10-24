import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Injectable,
} from '@nestjs/common';
import { DomainExceptionHandler } from './handlers/domain-exception.handler';
import { HttpExceptionHandler } from './handlers/http-exception.handler';
import { ThrottlerExceptionHandler } from './handlers/throttler-exception.handler';
import { UnknownErrorHandler } from './handlers/unknown-error.handler';
import { ExceptionHandler } from './handlers/exception-handler.interface';

@Catch()
@Injectable()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly handlers: ExceptionHandler[];
  private readonly fallback: ExceptionHandler;

  constructor(
    domainHandler: DomainExceptionHandler,
    throttlerHandler: ThrottlerExceptionHandler,
    httpHandler: HttpExceptionHandler,
    unknownHandler: UnknownErrorHandler,
  ) {
    // ThrottlerException extends HttpException — el más específico va antes
    // que el genérico, si no queda inalcanzable.
    this.handlers = [domainHandler, throttlerHandler, httpHandler];
    this.fallback = unknownHandler;
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const handler =
      this.handlers.find((h) => h.canHandle(exception)) ?? this.fallback;
    handler.handle(exception, host);
  }
}

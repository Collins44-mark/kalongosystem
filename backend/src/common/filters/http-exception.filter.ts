import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';

    // Log full error for debugging (shows in Render logs)
    this.logger.error(
      `${request.method} ${request.url} ${status}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    const body =
      typeof message === 'object' && message !== null && 'message' in message
        ? message
        : { message: typeof message === 'string' ? message : 'Internal server error' };

    response.status(status).json(body);
  }
}

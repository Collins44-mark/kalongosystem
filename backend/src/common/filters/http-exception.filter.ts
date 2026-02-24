import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

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

    const url = String(request?.url ?? '');
    const isUploads404 = status === 404 && url.startsWith('/uploads/');
    // Avoid noisy error logs for missing static uploads (e.g., after deploy/restart)
    if (!isUploads404) {
      this.logger.error(
        `${request.method} ${request.url} ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body =
      typeof message === 'object' && message !== null && 'message' in message
        ? message
        : { message: typeof message === 'string' ? message : 'Internal server error' };

    response.status(status).json(body);
  }
}

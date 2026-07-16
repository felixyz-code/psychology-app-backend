import { RequestIdMiddleware } from './request-id.middleware';
import { RequestContextService } from './request-context.service';

describe('RequestIdMiddleware', () => {
  let context: RequestContextService;
  let middleware: RequestIdMiddleware;

  beforeEach(() => {
    context = new RequestContextService();
    middleware = new RequestIdMiddleware(context);
  });

  it('preserves a valid incoming request ID and returns it in the response', () => {
    const setHeader = jest.fn();
    const next = jest.fn(() => expect(context.requestId).toBe('request_123'));

    middleware.use(
      { header: jest.fn().mockReturnValue('request_123') } as never,
      { setHeader } as never,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_123');
  });

  it('replaces an unsafe incoming request ID', () => {
    const setHeader = jest.fn();
    middleware.use(
      { header: jest.fn().mockReturnValue('unsafe value') } as never,
      { setHeader } as never,
      jest.fn(),
    );

    expect(setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    );
  });
});

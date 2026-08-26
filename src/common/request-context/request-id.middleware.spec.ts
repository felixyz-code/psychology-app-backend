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
    const headers: Record<string, string> = {};
    const setHeader = jest.fn((key: string, val: string) => {
      headers[key] = val;
    });
    const next = jest.fn(() => {
      expect(context.requestId).toBe('request_123');
      expect(context.traceId).toBeDefined();
      expect(context.traceparent).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
    });

    middleware.use(
      {
        header: jest.fn((name: string) => {
          if (name === 'x-request-id') return 'request_123';
          return undefined;
        }),
      } as never,
      { setHeader } as never,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith('x-request-id', 'request_123');
    expect(setHeader).toHaveBeenCalledWith(
      'traceparent',
      expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
    );
    expect(setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      expect.stringMatching(/^[0-9a-f]{32}$/),
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('replaces an unsafe incoming request ID with a random UUID', () => {
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

  it('extracts and propagates W3C traceparent when provided by incoming request', () => {
    const incomingTrace =
      '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';
    const setHeader = jest.fn();
    const next = jest.fn(() => {
      expect(context.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
      expect(context.traceparent).toMatch(
        /^00-4bf92f3577b34da6a3ce929d0e0e4736-[0-9a-f]{16}-01$/,
      );
    });

    middleware.use(
      {
        header: jest.fn((name: string) => {
          if (name === 'traceparent') return incomingTrace;
          return undefined;
        }),
      } as never,
      { setHeader } as never,
      next,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'x-trace-id',
      '4bf92f3577b34da6a3ce929d0e0e4736',
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});

import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../../src/middleware/auth';

jest.mock('../../../src/services/user.service', () => ({
  getUserService: () => ({
    getUserById: jest.fn(async (id: string) => {
      if (id === 'test-user') {
        return { id: 'test-user' };
      }
      if (id === 'disabled-user') {
        return { id: 'disabled-user', disabledAt: new Date() };
      }
      return null;
    })
  })
}));

jest.mock('../../../src/services/auth.service', () => ({
  getAuthService: () => ({
    verifyToken: jest.fn((token: string) => {
      if (token === 'valid-token') {
        return { userId: 'test-user', email: 'test@example.com' };
      }
      if (token === 'disabled-token') {
        return { userId: 'disabled-user', email: 'disabled@example.com' };
      }
      return null;
    })
  })
}));

describe('authMiddleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockReq = {
      headers: {}
    };
    mockRes = {
      status: statusMock,
      json: jsonMock
    };
    mockNext = jest.fn();
  });

  it('should allow request with valid Bearer token', async () => {
    mockReq.headers = {
      authorization: 'Bearer valid-token'
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is missing', async () => {
    mockReq.headers = {};

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing authorization header'
      }
    });
  });

  it('should return 401 when token format is invalid (no Bearer prefix)', async () => {
    mockReq.headers = {
      authorization: 'test-api-key-12345'
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authorization format. Use: Bearer <token>'
      }
    });
  });

  it('should return 401 when token format is invalid (wrong prefix)', async () => {
    mockReq.headers = {
      authorization: 'Basic test-api-key-12345'
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('should return 401 when token is invalid', async () => {
    mockReq.headers = {
      authorization: 'Bearer wrong-api-key'
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid token'
      }
    });
  });

  it('should return 401 when token is empty', async () => {
    mockReq.headers = {
      authorization: 'Bearer '
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('should return 403 when user account is disabled', async () => {
    mockReq.headers = {
      authorization: 'Bearer disabled-token'
    };

    await authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(403);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'ACCOUNT_DISABLED',
        message: 'Account is disabled'
      }
    });
  });
});

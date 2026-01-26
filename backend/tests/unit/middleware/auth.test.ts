import { Request, Response, NextFunction } from 'express';
import { authMiddleware } from '../../../src/middleware/auth';

// Mock the config module
jest.mock('../../../src/config/env', () => ({
  getConfig: () => ({
    API_KEY: 'test-api-key-12345'
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

  it('should allow request with valid Bearer token', () => {
    mockReq.headers = {
      authorization: 'Bearer test-api-key-12345'
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(statusMock).not.toHaveBeenCalled();
  });

  it('should return 401 when authorization header is missing', () => {
    mockReq.headers = {};

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing authorization header'
      }
    });
  });

  it('should return 401 when token format is invalid (no Bearer prefix)', () => {
    mockReq.headers = {
      authorization: 'test-api-key-12345'
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid authorization format. Use: Bearer <token>'
      }
    });
  });

  it('should return 401 when token format is invalid (wrong prefix)', () => {
    mockReq.headers = {
      authorization: 'Basic test-api-key-12345'
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
  });

  it('should return 401 when token does not match API_KEY', () => {
    mockReq.headers = {
      authorization: 'Bearer wrong-api-key'
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
    expect(jsonMock).toHaveBeenCalledWith({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid API key'
      }
    });
  });

  it('should return 401 when token is empty', () => {
    mockReq.headers = {
      authorization: 'Bearer '
    };

    authMiddleware(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(statusMock).toHaveBeenCalledWith(401);
  });
});

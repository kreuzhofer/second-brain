import OpenAI from 'openai';
import { ChatService } from '../../../src/services/chat.service';
import { getToolRegistry } from '../../../src/services/tool-registry';
import { CaptureResult, ToolExecutor } from '../../../src/services/tool-executor';

describe('ChatService capture action metadata', () => {
  const createService = (captureResult: CaptureResult) => {
    let openAICallCount = 0;
    const mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn().mockImplementation(() => {
            openAICallCount += 1;
            if (openAICallCount === 1) {
              return Promise.resolve({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: 'tool-call-1',
                      type: 'function',
                      function: {
                        name: 'classify_and_capture',
                        arguments: JSON.stringify({ text: 'Capture this' })
                      }
                    }]
                  },
                  finish_reason: 'tool_calls'
                }]
              });
            }
            return Promise.resolve({
              choices: [{
                message: {
                  role: 'assistant',
                  content: 'Captured.'
                },
                finish_reason: 'stop'
              }]
            });
          })
        }
      }
    } as unknown as OpenAI;

    const conversationService = {
      create: jest.fn().mockResolvedValue({
        id: 'conv-1',
        channel: 'chat',
        createdAt: new Date('2026-02-16T10:00:00.000Z'),
        updatedAt: new Date('2026-02-16T10:00:00.000Z')
      }),
      getById: jest.fn().mockResolvedValue(null),
      addMessage: jest
        .fn()
        .mockResolvedValueOnce({
          id: 'msg-user-1',
          conversationId: 'conv-1',
          role: 'user',
          content: 'Capture this',
          createdAt: new Date('2026-02-16T10:00:01.000Z')
        })
        .mockResolvedValueOnce({
          id: 'msg-assistant-1',
          conversationId: 'conv-1',
          role: 'assistant',
          content: 'Captured.',
          createdAt: new Date('2026-02-16T10:00:02.000Z')
        })
    };

    const contextAssembler = {
      assemble: jest.fn().mockResolvedValue({
        systemPrompt: 'Test system prompt',
        indexContent: '# Index',
        summaries: [],
        recentMessages: []
      })
    };

    const summarizationService = {
      checkAndSummarize: jest.fn().mockResolvedValue(undefined)
    };

    const toolExecutor = {
      execute: jest.fn().mockResolvedValue({
        success: true,
        data: captureResult
      })
    } as unknown as ToolExecutor;

    return new ChatService(
      conversationService as any,
      contextAssembler as any,
      { classify: jest.fn() } as any,
      summarizationService as any,
      { list: jest.fn().mockResolvedValue([]) } as any,
      getToolRegistry(),
      toolExecutor,
      mockOpenAI
    );
  };

  it('adds start-focus capture action for newly captured tasks', async () => {
    const service = createService({
      path: 'task/pay-invoice',
      category: 'task',
      name: 'Pay invoice',
      confidence: 0.91,
      clarificationNeeded: false
    });

    const response = await service.processMessageWithTools(null, 'Capture this');

    expect(response.message.captureAction).toEqual({
      type: 'start_focus_5m',
      entryPath: 'task/pay-invoice',
      entryName: 'Pay invoice',
      durationMinutes: 5,
      label: 'Start 5 minutes now'
    });
  });

  it('does not add start-focus capture action for non-task captures', async () => {
    const service = createService({
      path: 'projects/redesign-site',
      category: 'projects',
      name: 'Redesign site',
      confidence: 0.91,
      clarificationNeeded: false
    });

    const response = await service.processMessageWithTools(null, 'Capture this');

    expect(response.message.captureAction).toBeUndefined();
  });
});

import OpenAI from 'openai';
import { ActionExtractionService } from '../../../src/services/action-extraction.service';

const createMockOpenAI = (content: string) => {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content
              }
            }
          ]
        })
      }
    }
  } as unknown as OpenAI;
};

describe('ActionExtractionService', () => {
  it('should parse actions from JSON response', async () => {
    const mockResponse = JSON.stringify({
      primary_action: 'Email Sarah for dates',
      actions: [
        { text: 'Email Sarah for updated dates', type: 'admin', due_date: '2026-02-10', confidence: 0.9 }
      ]
    });

    const service = new ActionExtractionService(createMockOpenAI(mockResponse), 1000);
    const result = await service.extractActions('Follow up with Sarah', 'projects');

    expect(result.primaryAction).toBe('Email Sarah for dates');
    expect(result.actions.length).toBe(1);
    expect(result.actions[0].text).toContain('Email Sarah');
  });

  it('should return empty actions on invalid JSON', async () => {
    const service = new ActionExtractionService(createMockOpenAI('not-json'), 1000);
    const result = await service.extractActions('Follow up', 'projects');

    expect(result.actions).toEqual([]);
  });
});

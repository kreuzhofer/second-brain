/**
 * Chat API Routes
 * Handles chat message processing, conversation retrieval, and message history.
 * 
 * Requirements 12.1, 12.2, 12.3, 12.4, 12.5
 */

import { Router, Request, Response } from 'express';
import { getChatService, ChatServiceError } from '../services/chat.service';
import { getConversationService, ConversationNotFoundError } from '../services/conversation.service';
import { ChatRequest, ChatApiResponse, ConversationsResponse, MessagesResponse } from '../types/chat.types';

export const chatRouter = Router();

/**
 * POST /api/chat
 * Process a chat message and return the assistant response.
 * 
 * Requirements 12.1: Accept message text and optional hints
 * Requirements 12.4: Return ChatApiResponse with entry details if created
 */
chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, conversationId, hints } = req.body as ChatRequest;

    // Validate message first (before instantiating services)
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Message is required and must be a non-empty string'
        }
      });
      return;
    }

    const chatService = getChatService();

    // Process the message
    const response = await chatService.processMessage(
      conversationId || null,
      message.trim(),
      hints
    );

    // Format response for API
    const apiResponse: ChatApiResponse = {
      conversationId: response.conversationId,
      message: {
        id: response.message.id,
        role: 'assistant',
        content: response.message.content,
        filedEntryPath: response.message.filedEntryPath,
        filedConfidence: response.message.filedConfidence,
        quickReplies: response.message.quickReplies,
        createdAt: response.message.createdAt.toISOString(),
      },
      entry: response.entry ? {
        path: response.entry.path,
        category: response.entry.category,
        name: response.entry.name,
        confidence: response.entry.confidence,
      } : undefined,
      clarificationNeeded: response.clarificationNeeded,
      toolsUsed: response.toolsUsed,
    };

    res.status(201).json(apiResponse);
  } catch (error) {
    if (error instanceof ChatServiceError) {
      res.status(500).json({
        error: {
          code: 'CHAT_ERROR',
          message: error.message
        }
      });
      return;
    }
    console.error('Error processing chat message:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to process chat message'
      }
    });
  }
});

/**
 * GET /api/conversations
 * Return list of conversations with message counts.
 * 
 * Requirements 12.2: Support pagination
 */
chatRouter.get('/conversations', async (req: Request, res: Response) => {
  try {
    const conversationService = getConversationService();
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    // Get all conversations (we'll implement pagination in the service later)
    const conversations = await conversationService.list(limit, offset);

    const response: ConversationsResponse = {
      conversations: await Promise.all(
        conversations.map(async (conv) => ({
          id: conv.id,
          channel: conv.channel,
          createdAt: conv.createdAt.toISOString(),
          updatedAt: conv.updatedAt.toISOString(),
          messageCount: await conversationService.getMessageCount(conv.id),
        }))
      ),
    };

    res.json(response);
  } catch (error) {
    console.error('Error listing conversations:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list conversations'
      }
    });
  }
});

/**
 * GET /api/conversations/:id/messages
 * Return messages for a specific conversation.
 * 
 * Requirements 12.3: Include filed entry metadata
 */
chatRouter.get('/conversations/:id/messages', async (req: Request, res: Response) => {
  try {
    const conversationService = getConversationService();
    const conversationId = req.params.id;
    const limit = parseInt(req.query.limit as string) || 50;

    // Verify conversation exists
    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Conversation not found: ${conversationId}`
        }
      });
      return;
    }

    // Get messages
    const messages = await conversationService.getMessages(conversationId, limit);

    const response: MessagesResponse = {
      messages: messages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        filedEntryPath: msg.filedEntryPath || undefined,
        filedConfidence: msg.filedConfidence || undefined,
        quickReplies: msg.quickReplies,
        createdAt: msg.createdAt.toISOString(),
      })),
    };

    res.json(response);
  } catch (error) {
    if (error instanceof ConversationNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
      return;
    }
    console.error('Error getting conversation messages:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get conversation messages'
      }
    });
  }
});

/**
 * GET /api/conversations/:id
 * Get a specific conversation by ID.
 */
chatRouter.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversationService = getConversationService();
    const conversationId = req.params.id;

    const conversation = await conversationService.getById(conversationId);
    if (!conversation) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: `Conversation not found: ${conversationId}`
        }
      });
      return;
    }

    const messageCount = await conversationService.getMessageCount(conversationId);

    res.json({
      id: conversation.id,
      channel: conversation.channel,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
      messageCount,
    });
  } catch (error) {
    console.error('Error getting conversation:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get conversation'
      }
    });
  }
});

/**
 * IMAP Poller Service
 * Handles periodic polling of the IMAP server for new emails.
 * 
 * Handles:
 * - Initializing node-imap connection from EmailConfig
 * - Starting/stopping polling at configured interval
 * - Fetching only UNSEEN emails from INBOX
 * - Processing emails in chronological order (oldest first)
 * - Marking processed emails as read
 * - Graceful error handling (log and continue, don't crash)
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import Imap from 'node-imap';
import { getEmailConfig, EmailConfig } from '../config/email';
import { getEmailParser, ParsedEmail, EmailAddress } from './email-parser';
import { getThreadTracker } from './thread-tracker';
import { getUserService } from './user.service';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Result of a poll operation
 */
export interface PollResult {
  emailsFound: number;
  emailsProcessed: number;
  errors: string[];
}

/**
 * Callback function for processing emails.
 * Accepts optional userId for per-user routing.
 * Returns true if email was processed successfully.
 */
export type EmailProcessor = (email: ParsedEmail, userId?: string) => Promise<boolean>;

/**
 * Extract the +code suffix from recipient email addresses.
 * E.g., "user+a3f2e1@example.com" → "a3f2e1"
 * Returns null if no valid 6-char hex +suffix found in any recipient.
 */
export function extractRecipientCode(recipients: EmailAddress[]): string | null {
  for (const r of recipients) {
    const match = r.address.match(/\+([a-f0-9]{6})@/i);
    if (match) return match[1].toLowerCase();
  }
  return null;
}

/**
 * Interface for the ImapPoller service
 */
export interface IImapPoller {
  /**
   * Start polling at configured interval
   * Requirement 7.1
   */
  start(): void;

  /**
   * Stop polling
   */
  stop(): void;

  /**
   * Check if currently polling
   */
  isRunning(): boolean;

  /**
   * Manually trigger a poll (for testing)
   */
  pollNow(): Promise<PollResult>;

  /**
   * Set the email processor callback
   */
  setProcessor(processor: EmailProcessor): void;
}

// ============================================
// Custom Errors
// ============================================

/**
 * Error thrown when IMAP connection fails
 * Note: This is used internally for logging, but we handle errors gracefully
 * and continue operation (Requirement 7.4)
 */
export class ImapConnectionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(`IMAP connection failed: ${message}`);
    this.name = 'ImapConnectionError';
  }
}

// ============================================
// ImapPoller Class
// ============================================

export class ImapPoller implements IImapPoller {
  private config: EmailConfig;
  private pollIntervalId: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private processor: EmailProcessor | null = null;
  private emailParser = getEmailParser();
  private threadTracker = getThreadTracker();

  constructor() {
    this.config = getEmailConfig();
  }

  /**
   * Start polling at configured interval
   * 
   * Begins periodic polling of the IMAP server for new emails.
   * Does nothing if IMAP is not configured or already running.
   * 
   * Requirement 7.1: Begin polling at configured interval when app starts
   */
  start(): void {
    if (this.running) {
      console.warn('ImapPoller: Already running');
      return;
    }

    if (!this.config.imap) {
      console.warn('ImapPoller: IMAP not configured, cannot start polling');
      return;
    }

    this.running = true;
    const intervalMs = this.config.pollInterval * 1000;

    console.log(`ImapPoller: Starting polling every ${this.config.pollInterval} seconds`);

    // Run immediately on start
    this.pollNow().catch(err => {
      console.error('ImapPoller: Initial poll failed:', err);
    });

    // Then run at configured interval
    this.pollIntervalId = setInterval(() => {
      this.pollNow().catch(err => {
        console.error('ImapPoller: Poll failed:', err);
      });
    }, intervalMs);
  }

  /**
   * Stop polling
   * 
   * Halts the periodic polling. Safe to call even if not running.
   */
  stop(): void {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
    this.running = false;
    console.log('ImapPoller: Stopped polling');
  }

  /**
   * Check if currently polling
   * 
   * @returns true if polling is active
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Set the email processor callback
   * 
   * The processor is called for each email fetched from the server.
   * It should return true if the email was processed successfully.
   * 
   * @param processor - Callback function to process emails
   */
  setProcessor(processor: EmailProcessor): void {
    this.processor = processor;
  }

  /**
   * Test IMAP connection and authentication
   * 
   * Attempts to connect to the IMAP server and authenticate.
   * This should be called at startup to catch configuration issues early.
   * 
   * @returns Promise resolving to success status and optional error message
   */
  async testConnection(): Promise<{ success: boolean; error?: string }> {
    if (!this.config.imap) {
      return { success: false, error: 'IMAP not configured' };
    }

    return new Promise((resolve) => {
      const imap = new Imap({
        user: this.config.imap!.user,
        password: this.config.imap!.pass,
        host: this.config.imap!.host,
        port: this.config.imap!.port,
        tls: this.config.imap!.tls,
        tlsOptions: { rejectUnauthorized: false },
        connTimeout: 10000, // 10 second timeout for connection test
        authTimeout: 10000,
      });

      imap.once('ready', () => {
        imap.end();
        resolve({ success: true });
      });

      imap.once('error', (err: Error) => {
        resolve({ success: false, error: err.message });
      });

      imap.connect();
    });
  }

  /**
   * Manually trigger a poll
   * 
   * Connects to the IMAP server, fetches UNSEEN emails from INBOX,
   * processes them in chronological order, and marks them as read.
   * 
   * Requirements:
   * - 7.2: Only fetch emails from INBOX folder
   * - 7.3: Process emails in chronological order (oldest first)
   * - 7.4: Handle connection errors gracefully
   * - 7.5: Don't process same email twice (track by Message-ID)
   * 
   * @returns PollResult with counts and any errors
   */
  async pollNow(): Promise<PollResult> {
    const result: PollResult = {
      emailsFound: 0,
      emailsProcessed: 0,
      errors: [],
    };

    if (!this.config.imap) {
      result.errors.push('IMAP not configured');
      return result;
    }

    console.log('ImapPoller: Polling for new emails...');

    try {
      const emails = await this.fetchUnseenEmails();
      result.emailsFound = emails.length;

      console.log(`ImapPoller: Found ${emails.length} unseen email(s)`);

      if (emails.length === 0) {
        return result;
      }

      // Sort by date (oldest first) - Requirement 7.3
      emails.sort((a, b) => a.date.getTime() - b.date.getTime());

      for (const email of emails) {
        // Log incoming email details
        const fromAddr = email.from?.address || 'unknown';
        console.log(`ImapPoller: Processing email - Subject: "${email.subject}" From: ${fromAddr}`);

        try {
          // Per-user routing: extract +code from recipient addresses
          const recipientCode = extractRecipientCode(email.to);
          let routedUserId: string | undefined;

          if (recipientCode) {
            const userService = getUserService();
            const user = await userService.getUserByInboundCode(recipientCode);
            if (!user) {
              console.log(`ImapPoller: Unknown inbound code "${recipientCode}", dropping email: ${email.messageId}`);
              continue;
            }
            routedUserId = user.id;
            console.log(`ImapPoller: Routed to user ${user.email} via code ${recipientCode}`);
          } else {
            console.log(`ImapPoller: No routing code in recipients, using default user`);
          }

          // Check for duplicate by Message-ID - Requirement 7.5
          const existing = await this.threadTracker.getByMessageId(email.messageId);
          if (existing) {
            console.log(`ImapPoller: Skipping duplicate email: ${email.messageId}`);
            continue;
          }

          // Process the email
          if (this.processor) {
            const success = await this.processor(email, routedUserId);
            if (success) {
              result.emailsProcessed++;
              console.log(`ImapPoller: Successfully processed email - Subject: "${email.subject}"`);
            } else {
              result.errors.push(`Failed to process email: ${email.messageId}`);
              console.error(`ImapPoller: Failed to process email - Subject: "${email.subject}"`);
            }
          } else {
            // No processor set, just count as processed
            console.log(`ImapPoller: No processor set, skipping email - Subject: "${email.subject}"`);
            result.emailsProcessed++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Error processing ${email.messageId}: ${errorMsg}`);
          console.error(`ImapPoller: Error processing email "${email.subject}":`, error);
        }
      }
    } catch (error) {
      // Handle connection errors gracefully - Requirement 7.4
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`IMAP connection error: ${errorMsg}`);
      console.error('ImapPoller: Connection error:', error);
    }

    return result;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Fetch UNSEEN emails from INBOX
   * 
   * Creates a new IMAP connection, opens INBOX, searches for UNSEEN emails,
   * fetches their content, parses them, and marks them as read.
   * 
   * Requirements:
   * - 7.2: Only fetch from INBOX folder
   * - 2.5: Mark processed emails as read
   * 
   * @returns Array of parsed emails
   */
  private async fetchUnseenEmails(): Promise<ParsedEmail[]> {
    if (!this.config.imap) {
      throw new ImapConnectionError('IMAP not configured');
    }

    return new Promise((resolve, reject) => {
      const emails: ParsedEmail[] = [];
      const uidsToMarkRead: number[] = [];
      const parsePromises: Promise<void>[] = [];

      const imap = new Imap({
        user: this.config.imap!.user,
        password: this.config.imap!.pass,
        host: this.config.imap!.host,
        port: this.config.imap!.port,
        tls: this.config.imap!.tls,
        tlsOptions: { rejectUnauthorized: false },
      });

      imap.once('ready', () => {
        // Open INBOX - Requirement 7.2
        imap.openBox('INBOX', false, (err, box) => {
          if (err) {
            imap.end();
            reject(new ImapConnectionError(`Failed to open INBOX: ${err.message}`, err));
            return;
          }

          // Log mailbox info for debugging
          console.log(`ImapPoller: Opened INBOX - Total: ${box.messages.total}, New: ${box.messages.new}, Unseen: ${box.messages.unseen || 'unknown'}`);

          // Search for UNSEEN emails
          imap.search(['UNSEEN'], (searchErr, uids) => {
            if (searchErr) {
              imap.end();
              reject(new ImapConnectionError(`Search failed: ${searchErr.message}`, searchErr));
              return;
            }

            console.log(`ImapPoller: UNSEEN search returned ${uids ? uids.length : 0} UIDs`);

            if (!uids || uids.length === 0) {
              imap.end();
              resolve([]);
              return;
            }

            // Fetch email bodies
            const fetch = imap.fetch(uids, {
              bodies: '',
              struct: true,
            });

            console.log(`ImapPoller: Fetching ${uids.length} email(s) with UIDs: ${uids.join(', ')}`);

            fetch.on('message', (msg, seqno) => {
              let buffer = '';
              let uid: number | undefined;

              console.log(`ImapPoller: Processing message seqno=${seqno}`);

              msg.on('body', (stream) => {
                stream.on('data', (chunk) => {
                  buffer += chunk.toString('utf8');
                });
              });

              msg.once('attributes', (attrs) => {
                uid = attrs.uid;
                console.log(`ImapPoller: Message ${seqno} attributes - UID=${uid}, flags=${attrs.flags?.join(',')}`);
              });

              // Create a promise for this message's parsing
              const parsePromise = new Promise<void>((resolveMsg) => {
                msg.once('end', async () => {
                  console.log(`ImapPoller: Message ${seqno} end event, buffer length=${buffer.length}`);
                  try {
                    const parsed = await this.emailParser.parse(buffer);
                    const fromAddr = parsed.from?.address || 'unknown';
                    console.log(`ImapPoller: Parsed email - Subject: "${parsed.subject}", From: ${fromAddr}`);
                    emails.push(parsed);
                    if (uid !== undefined) {
                      uidsToMarkRead.push(uid);
                    }
                  } catch (parseErr) {
                    console.error(`ImapPoller: Failed to parse email ${seqno}:`, parseErr);
                  }
                  resolveMsg();
                });
              });
              parsePromises.push(parsePromise);
            });

            fetch.once('error', (fetchErr) => {
              console.error('ImapPoller: Fetch error:', fetchErr);
            });

            fetch.once('end', async () => {
              // Wait for all message parsing to complete
              await Promise.all(parsePromises);
              
              console.log(`ImapPoller: All messages parsed, ${emails.length} email(s) ready`);
              
              // Mark emails as read - Requirement 2.5
              if (uidsToMarkRead.length > 0) {
                imap.addFlags(uidsToMarkRead, ['\\Seen'], (flagErr) => {
                  if (flagErr) {
                    console.error('ImapPoller: Failed to mark emails as read:', flagErr);
                  }
                  imap.end();
                  resolve(emails);
                });
              } else {
                imap.end();
                resolve(emails);
              }
            });
          });
        });
      });

      imap.once('error', (err: Error) => {
        reject(new ImapConnectionError(err.message, err));
      });

      imap.once('end', () => {
        // Connection ended
      });

      imap.connect();
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let imapPollerInstance: ImapPoller | null = null;

/**
 * Get the ImapPoller singleton instance
 */
export function getImapPoller(): ImapPoller {
  if (!imapPollerInstance) {
    imapPollerInstance = new ImapPoller();
  }
  return imapPollerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetImapPoller(): void {
  if (imapPollerInstance) {
    imapPollerInstance.stop();
  }
  imapPollerInstance = null;
}

import { getEmailConfig } from '../config/email';
import { getEmailService } from './email.service';

/**
 * Database-backed storage no longer requires a data folder.
 * This function is kept for compatibility with startup flows.
 */
export async function initializeDataFolder(): Promise<void> {
  console.log('Data storage: database-backed (no filesystem init required)');
}

/**
 * Verify data folder structure (deprecated).
 */
export async function verifyDataFolder(): Promise<boolean> {
  return true;
}

/**
 * Initialize the email channel
 * Loads email configuration, verifies connectivity, and starts IMAP polling if enabled
 */
export async function initializeEmailChannel(): Promise<void> {
  const emailConfig = getEmailConfig();

  if (emailConfig.enabled) {
    console.log('Email channel: enabled');

    if (emailConfig.smtp) {
      const secureMode = emailConfig.smtp.secure ? 'TLS' : 'STARTTLS';
      console.log(`  SMTP: ${emailConfig.smtp.host}:${emailConfig.smtp.port} (${secureMode})`);
      console.log(`  SMTP user: ${emailConfig.smtp.user}`);

      const { getSmtpSender } = await import('./smtp-sender');
      const smtpSender = getSmtpSender();
      const smtpResult = await smtpSender.verify();
      if (smtpResult.success) {
        console.log('  SMTP: connection verified ✓');
      } else {
        console.error(`  SMTP: connection failed - ${smtpResult.error}`);
      }
    }

    if (emailConfig.imap) {
      const tlsMode = emailConfig.imap.tls ? 'TLS' : 'plain';
      console.log(`  IMAP: ${emailConfig.imap.host}:${emailConfig.imap.port} (${tlsMode})`);
      console.log(`  IMAP user: ${emailConfig.imap.user}`);
      console.log(`  Poll interval: ${emailConfig.pollInterval}s`);

      const { getImapPoller } = await import('./imap-poller');
      const imapPoller = getImapPoller();
      const imapResult = await imapPoller.testConnection();
      if (imapResult.success) {
        console.log('  IMAP: connection verified ✓');
      } else {
        console.error(`  IMAP: connection failed - ${imapResult.error}`);
      }
    }

    const emailService = getEmailService();
    if (emailService.isEnabled()) {
      emailService.startPolling();
      console.log('  IMAP polling: started');
    }
  } else {
    console.log('Email channel: disabled (missing configuration)');
  }
}

/**
 * Shutdown the email channel
 */
export async function shutdownEmailChannel(): Promise<void> {
  const emailConfig = getEmailConfig();

  if (emailConfig.enabled) {
    const emailService = getEmailService();
    emailService.stopPolling();
    console.log('Email channel: stopped');
  }
}

export interface SmsInviteNotification {
  body: string;
  to: string;
}

export interface EmailInviteNotification {
  body: string;
  subject: string;
  to: string;
}

export interface InviteNotifier {
  sendEmail(input: EmailInviteNotification): Promise<void>;
  sendSms(input: SmsInviteNotification): Promise<void>;
}

export class NoopInviteNotifier implements InviteNotifier {
  async sendEmail(): Promise<void> {
    return;
  }

  async sendSms(): Promise<void> {
    return;
  }
}

export class RecordingInviteNotifier implements InviteNotifier {
  readonly emails: EmailInviteNotification[] = [];
  readonly sms: SmsInviteNotification[] = [];

  clear(): void {
    this.emails.length = 0;
    this.sms.length = 0;
  }

  async sendEmail(input: EmailInviteNotification): Promise<void> {
    this.emails.push(input);
  }

  async sendSms(input: SmsInviteNotification): Promise<void> {
    this.sms.push(input);
  }
}

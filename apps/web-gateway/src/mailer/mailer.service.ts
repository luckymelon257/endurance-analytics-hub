export interface SendMailOptions {
  to: string
  subject: string
  template: string
  context: Record<string, unknown>
}

export abstract class MailerService {
  public abstract sendMail(opts: SendMailOptions): Promise<void>
}

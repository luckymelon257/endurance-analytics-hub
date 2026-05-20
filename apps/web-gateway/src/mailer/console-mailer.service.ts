import { Injectable, Logger } from '@nestjs/common'
import * as ejs from 'ejs'
import { join } from 'path'
import { MailerService, SendMailOptions } from './mailer.service'

@Injectable()
export class ConsoleMailerService extends MailerService {
  private readonly logger = new Logger('ConsoleMailer')
  private readonly templatesDir = join(process.cwd(), 'views', 'emails')

  public async sendMail({ to, subject, template, context }: SendMailOptions): Promise<void> {
    const path = join(this.templatesDir, `${template}.ejs`)
    const html = await ejs.renderFile(path, context)

    this.logger.log(`\n────── EMAIL ──────\nTo:      ${to}\nSubject: ${subject}\n\n${html}\n───────────────────`)
  }
}

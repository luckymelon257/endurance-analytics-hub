import { Module } from '@nestjs/common'
import { ConsoleMailerService } from './console-mailer.service'
import { MailerService } from './mailer.service'

@Module({
  providers: [{ provide: MailerService, useClass: ConsoleMailerService }],
  exports: [MailerService],
})
export class MailerModule {}

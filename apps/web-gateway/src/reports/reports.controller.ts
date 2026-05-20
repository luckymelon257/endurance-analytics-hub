import {
  Controller,
  Get,
  Post,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Redirect,
  Logger,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { Response } from 'express'
import { User } from '@prisma/client'
import { CurrentUser } from '../auth/decorators/current-user.decorator'
import { Public } from '../auth/decorators/public.decorator'
import { WebAuthGuard } from '../auth/guards/web-auth.guard'
import { ReportsService } from './reports.service'

@Controller('reports')
export class ReportsController {
  private readonly logger = new Logger(ReportsController.name)

  constructor(private readonly reportsService: ReportsService) {}

  /**
   * GET /reports/export/excel
   * Downloads monthly activities as Excel file
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('export/excel')
  public async exportExcel(@CurrentUser() user: User, @Res() res: Response) {
    try {
      const buffer = await this.reportsService.generateExcelReport(user.id)

      const now = new Date()
      const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })
      const filename = `training-report-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}.xlsx`

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', buffer.length)

      res.send(buffer)
    } catch (error) {
      this.logger.error(`Failed to export Excel report: ${error.message}`)
      res.status(500).json({ error: 'Failed to generate Excel report' })
    }
  }

  /**
   * GET /reports/export/word
   * Downloads monthly activities as Word document
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Get('export/word')
  public async exportWord(@CurrentUser() user: User, @Res() res: Response) {
    try {
      const buffer = await this.reportsService.generateWordReport(user.id)

      const filename = `training-report-${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}.docx`

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Length', buffer.length)

      res.send(buffer)
    } catch (error) {
      this.logger.error(`Failed to export Word report: ${error.message}`)
      res.status(500).json({ error: 'Failed to generate Word report' })
    }
  }

  /**
   * POST /reports/import
   * Imports activities from uploaded Excel file
   */
  @Public()
  @UseGuards(WebAuthGuard)
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  @Redirect('/activities', 302)
  public async importExcel(
    @CurrentUser() user: User,
    @UploadedFile() file: Express.Multer.File,
  ) {
    try {
      if (!file) {
        throw new Error('No file uploaded')
      }

      if (!file.originalname.endsWith('.xlsx')) {
        throw new Error('Only .xlsx files are supported')
      }

      const importedCount = await this.reportsService.importExcelActivities(user.id, file.buffer)

      this.logger.log(`Successfully imported ${importedCount} activities for user ${user.id}`)

      // Redirect to activities page; the user will see the new activities
      return {}
    } catch (error) {
      this.logger.error(`Failed to import Excel file: ${error.message}`)
      // In a real application, you might want to handle this error more gracefully
      // by redirecting to an error page or showing a flash message
      throw error
    }
  }
}

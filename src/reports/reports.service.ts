import { BadRequestException, Injectable, Logger } from '@nestjs/common'
import { Workbook } from 'exceljs'
import {
  Document,
  Packer,
  Table,
  TableRow,
  TableCell,
  Paragraph,
  TextRun,
  HeadingLevel,
  TableLayoutType,
} from 'docx'
import * as XLSX from 'xlsx'
import { PrismaService } from '../prisma/prisma.service'
import { SportType } from '@prisma/client'

interface MonthlyActivityRow {
  date: string
  title: string
  sportType: string
  distanceKm: number | null
  durationMin: number | null
  isManual: boolean
}

interface ImportActivityRow {
  title: string
  sportType: string
  date: string
  durationMin: number
  distanceKm: number
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name)

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate Excel report for current month's activities
   */
  public async generateExcelReport(userId: string): Promise<Buffer> {
    const activities = await this.getMonthlyActivities(userId)

    const workbook = new Workbook()
    const worksheet = workbook.addWorksheet('My Activities')

    // Define columns
    worksheet.columns = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Title', key: 'title', width: 30 },
      { header: 'Sport Type', key: 'sportType', width: 15 },
      { header: 'Distance (km)', key: 'distanceKm', width: 15 },
      { header: 'Duration (min)', key: 'durationMin', width: 15 },
      { header: 'Manual', key: 'isManual', width: 10 },
    ]

    // Style header row
    const headerRow = worksheet.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }

    // Add data rows
    for (const activity of activities) {
      worksheet.addRow({
        date: activity.date,
        title: activity.title,
        sportType: activity.sportType,
        distanceKm: activity.distanceKm ?? '',
        durationMin: activity.durationMin ?? '',
        isManual: activity.isManual ? 'Yes' : 'No',
      })
    }

    // Format data cells
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return // Skip header
      row.alignment = { horizontal: 'left', vertical: 'middle' }
      // Format numeric columns
      if (row.getCell('distanceKm').value !== '') {
        row.getCell('distanceKm').numFmt = '0.00'
      }
    })

    // Return as buffer
    const buffer = (await workbook.xlsx.writeBuffer()) as unknown as Buffer
    return buffer
  }

  /**
   * Generate Word report for current month's activities
   */
  public async generateWordReport(userId: string): Promise<Buffer> {
    const activities = await this.getMonthlyActivities(userId)

    // Calculate summary stats
    const totalActivities = activities.length
    const totalDistance = activities.reduce((sum, a) => sum + (a.distanceKm ?? 0), 0)
    const totalDuration = activities.reduce((sum, a) => sum + (a.durationMin ?? 0), 0)

    const now = new Date()
    const monthName = now.toLocaleString('en-US', { month: 'long', year: 'numeric' })

    const tableColumns = [
      { header: 'Date', values: activities.map((activity) => activity.date) },
      { header: 'Title', values: activities.map((activity) => activity.title) },
      { header: 'Sport', values: activities.map((activity) => activity.sportType) },
      {
        header: 'Distance (km)',
        values: activities.map((activity) => activity.distanceKm?.toFixed(2) ?? '-'),
      },
      {
        header: 'Duration (min)',
        values: activities.map((activity) => activity.durationMin?.toString() ?? '-'),
      },
    ]

    const columnWidths = tableColumns.map((column) => {
      const widestText = [column.header, ...column.values].reduce(
        (widest, current) => (current.length > widest.length ? current : widest),
        '',
      )
      return Math.min(Math.max(widestText.length * 120, 1200), 4200)
    })

    // Create table rows for activities
    const tableRows = [
      // Header row
      new TableRow({
        children: [
          new TableCell({ width: { size: columnWidths[0], type: 'dxa' }, children: [new Paragraph('Date')] }),
          new TableCell({ width: { size: columnWidths[1], type: 'dxa' }, children: [new Paragraph('Title')] }),
          new TableCell({ width: { size: columnWidths[2], type: 'dxa' }, children: [new Paragraph('Sport')] }),
          new TableCell({ width: { size: columnWidths[3], type: 'dxa' }, children: [new Paragraph('Distance (km)')] }),
          new TableCell({ width: { size: columnWidths[4], type: 'dxa' }, children: [new Paragraph('Duration (min)')] }),
        ],
      }),
      // Data rows
      ...activities.map(
        (activity) =>
          new TableRow({
            children: [
              new TableCell({ width: { size: columnWidths[0], type: 'dxa' }, children: [new Paragraph(activity.date)] }),
              new TableCell({ width: { size: columnWidths[1], type: 'dxa' }, children: [new Paragraph(activity.title)] }),
              new TableCell({ width: { size: columnWidths[2], type: 'dxa' }, children: [new Paragraph(activity.sportType)] }),
              new TableCell({
                width: { size: columnWidths[3], type: 'dxa' },
                children: [new Paragraph(activity.distanceKm?.toFixed(2) ?? '-')],
              }),
              new TableCell({
                width: { size: columnWidths[4], type: 'dxa' },
                children: [new Paragraph(activity.durationMin?.toString() ?? '-')],
              }),
            ],
          }),
      ),
    ]

    const document = new Document({
      sections: [
        {
          children: [
            new Paragraph({
              text: 'Monthly Training Report',
              heading: HeadingLevel.HEADING_1,
              spacing: { after: 200 },
            }),
            new Paragraph({
              text: `Report for ${monthName}`,
              spacing: { after: 400 },
            }),
            new Paragraph({
              text: `Summary`,
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 },
            }),
            new Paragraph({
              children: [
                new TextRun(`Total Activities: `),
                new TextRun({ text: totalActivities.toString(), bold: true }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun(`Total Distance: `),
                new TextRun({ text: totalDistance.toFixed(2) + ' km', bold: true }),
              ],
              spacing: { after: 100 },
            }),
            new Paragraph({
              children: [
                new TextRun(`Total Duration: `),
                new TextRun({ text: totalDuration + ' minutes', bold: true }),
              ],
              spacing: { after: 400 },
            }),
            new Paragraph({
              text: `Activities`,
              heading: HeadingLevel.HEADING_2,
              spacing: { after: 200 },
            }),
            new Table({
              rows: tableRows,
              width: { size: 100, type: 'pct' },
              layout: TableLayoutType.AUTOFIT,
              columnWidths,
            }),
          ],
        },
      ],
    })

    const buffer = await Packer.toBuffer(document)
    return buffer
  }

  /**
   * Import activities from Excel file
   */
  public async importExcelActivities(userId: string, fileBuffer: Buffer): Promise<number> {
    try {
      // Read the Excel file
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]

      if (!worksheet) {
        throw new BadRequestException('No worksheet found in the file')
      }

      // Convert to JSON, skipping first row if it's a header
      const rows: any[] = XLSX.utils.sheet_to_json(worksheet)

      if (rows.length === 0) {
        throw new BadRequestException('No data found in the file')
      }

      let importedCount = 0

      // Process each row
      for (const row of rows) {
        try {
          const importedRow = this.parseImportRow(row)

          // Create activity in database
          await this.prisma.activity.create({
            data: {
              userId,
              isManual: true,
              externalId: null,
              status: 'COMPLETED',
              title: importedRow.title.trim(),
              sportType: importedRow.sportType as SportType,
              startedAt: new Date(importedRow.date),
              durationSeconds: Math.round(importedRow.durationMin * 60),
              distanceMeters: importedRow.distanceKm * 1000,
            },
          })

          importedCount++
        } catch (error) {
          // Log the error but continue processing other rows
          this.logger.warn(`Failed to import row: ${JSON.stringify(row)}, error: ${error.message}`)
        }
      }

      return importedCount
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error
      }
      this.logger.error(`Failed to import Excel file: ${error.message}`)
      throw new BadRequestException(`Failed to import Excel file: ${error.message}`)
    }
  }

  /**
   * Fetch activities for the current month
   */
  private async getMonthlyActivities(userId: string): Promise<MonthlyActivityRow[]> {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

    const activities = await this.prisma.activity.findMany({
      where: {
        userId,
        startedAt: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      orderBy: {
        startedAt: 'asc',
      },
      select: {
        title: true,
        sportType: true,
        startedAt: true,
        durationSeconds: true,
        distanceMeters: true,
        isManual: true,
      },
    })

    return activities.map((activity) => ({
      date: activity.startedAt
        ? activity.startedAt.toLocaleDateString('en-US', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          })
        : 'N/A',
      title: activity.title,
      sportType: activity.sportType,
      distanceKm: activity.distanceMeters ? activity.distanceMeters / 1000 : null,
      durationMin: activity.durationSeconds ? Math.round(activity.durationSeconds / 60) : null,
      isManual: activity.isManual,
    }))
  }

  /**
   * Parse and validate a row from the import file
   */
  private parseImportRow(row: any): ImportActivityRow {
    const title = row.Title || row.title || row.Activity
    const sportType = row['Sport Type'] || row.sportType || row.Sport
    const date = row.Date || row.date
    const duration = row['Duration (min)'] || row.durationMin || row.Duration
    const distance = row['Distance (km)'] || row.distanceKm || row.Distance

    if (!title || typeof title !== 'string') {
      throw new BadRequestException('Missing or invalid Title column')
    }

    if (!sportType || typeof sportType !== 'string') {
      throw new BadRequestException('Missing or invalid Sport Type column')
    }

    // Validate sport type
    const validSports = ['RUNNING', 'CYCLING', 'SWIMMING', 'ROWING', 'OTHER']
    const normalizedSport = sportType.toUpperCase().trim()
    if (!validSports.includes(normalizedSport)) {
      throw new BadRequestException(
        `Invalid Sport Type: ${sportType}. Must be one of: ${validSports.join(', ')}`,
      )
    }

    if (!date) {
      throw new BadRequestException('Missing or invalid Date column')
    }

    const parsedDate = new Date(date)
    if (Number.isNaN(parsedDate.getTime())) {
      throw new BadRequestException(`Invalid date format: ${date}`)
    }

    const durationNum = Number(duration)
    if (!Number.isFinite(durationNum) || durationNum <= 0) {
      throw new BadRequestException(`Invalid Duration: ${duration}. Must be a positive number.`)
    }

    const distanceNum = Number(distance) || 0
    if (!Number.isFinite(distanceNum) || distanceNum < 0) {
      throw new BadRequestException(`Invalid Distance: ${distance}. Must be zero or positive.`)
    }

    return {
      title: title.trim(),
      sportType: normalizedSport,
      date: parsedDate.toISOString(),
      durationMin: durationNum,
      distanceKm: distanceNum,
    }
  }
}

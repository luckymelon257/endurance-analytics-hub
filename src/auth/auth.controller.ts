import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Render,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import { User } from '@prisma/client'
import { Request, Response } from 'express'
import { OperationMessage } from '../common/types'
import { AuthService } from './auth.service'
import { CurrentUser } from './decorators/current-user.decorator'
import { Public } from './decorators/public.decorator'
import { ForgotPasswordDto } from './dto/forgot-password.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { ResendVerificationDto } from './dto/resend-verification.dto'
import { ResetPasswordDto } from './dto/reset-password.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Get('login')
  @Render('auth/login')
  public loginPage(@Req() req: Request) {
    return { title: 'Login', query: req.query }
  }

  @Public()
  @Get('register')
  @Render('auth/register')
  public registerPage(@Req() req: Request) {
    return { title: 'Register', query: req.query }
  }

  @Public()
  @Post('register')
  public async register(@Body() dto: RegisterDto, @Res() res: Response) {
    await this.authService.register(dto)
    return res.redirect(`/auth/check-email?email=${encodeURIComponent(dto.email)}`)
  }

  @Public()
  @Get('check-email')
  @Render('auth/check-email')
  public checkEmailPage(@Query('email') email: string) {
    return { title: 'Check your email', email: email ?? '' }
  }

  @Public()
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  public async resendVerification(
    @Body() dto: ResendVerificationDto,
  ): Promise<OperationMessage> {
    await this.authService.resendVerification(dto)
    return { message: 'If your email is registered and unverified, a new link has been sent.' }
  }

  @Public()
  @Get('verify-email')
  public async verifyEmail(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.verifyEmail(token)
      return res.render('auth/verified-success', { title: 'Email verified' })
    } catch {
      return res.render('auth/verified-failed', { title: 'Verification failed' })
    }
  }

  /**
   * Confirm a settings-page email-change request. Public so users coming from
   * the link in their email (possibly in a different browser session) can land
   * on it — the token itself is the proof of intent.
   */
  @Public()
  @Get('confirm-email-change')
  public async confirmEmailChange(@Query('token') token: string, @Res() res: Response) {
    try {
      await this.authService.confirmEmailChange(token)
      return res.redirect('/settings?email_changed=1')
    } catch {
      return res.redirect('/settings?email_change_error=1')
    }
  }

  @Public()
  @Post('login')
  public async login(@Body() dto: LoginDto, @Res() res: Response) {
    await this.authService.login(dto, res)
    return res.redirect('/dashboard')
  }

  @Post('logout')
  public logout(@Res() res: Response) {
    this.authService.logout(res)
    return res.redirect('/auth/login')
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  public forgotPassword(@Body() dto: ForgotPasswordDto): Promise<OperationMessage> {
    return this.authService.forgotPassword(dto)
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  public resetPassword(@Body() dto: ResetPasswordDto): Promise<OperationMessage> {
    return this.authService.resetPassword(dto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  public changePassword(
    @CurrentUser() user: User,
    @Body('currentPassword') current: string,
    @Body('newPassword') next: string,
  ): Promise<OperationMessage> {
    return this.authService.changePassword(user.id, current, next)
  }
}

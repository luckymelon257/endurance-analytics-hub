import { IsOptional, IsString } from 'class-validator'

export class DeleteAccountDto {
  /** User must type a known phrase exactly — guards against accidental clicks. */
  @IsString()
  confirmation: string

  /** Required for password-bearing accounts; ignored for Strava-only ones. */
  @IsOptional()
  @IsString()
  password?: string
}

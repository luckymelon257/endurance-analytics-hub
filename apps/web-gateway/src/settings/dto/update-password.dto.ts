import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator'

/**
 * Unified shape covering both flows:
 *  - placeholder Strava-only users: only `newPassword` is required.
 *  - regular accounts: both fields required (enforced by the service).
 */
export class UpdatePasswordDto {
  @IsOptional()
  @IsString()
  currentPassword?: string

  @IsString()
  @MinLength(8)
  @MaxLength(72)
  newPassword: string
}

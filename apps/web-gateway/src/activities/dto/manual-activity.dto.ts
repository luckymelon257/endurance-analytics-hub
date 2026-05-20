import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator'

const MANUAL_SPORT_TYPES = ['RUNNING', 'CYCLING', 'SWIMMING', 'OTHER'] as const

export class ManualActivityDto {
  @IsString()
  @MaxLength(200)
  public title!: string

  @IsString()
  @IsIn(MANUAL_SPORT_TYPES)
  public sportType!: (typeof MANUAL_SPORT_TYPES)[number]

  @IsOptional()
  @IsString()
  public startedAt?: string

  @IsOptional()
  @IsString()
  public durationMinutes?: string

  @IsOptional()
  @IsString()
  public distanceKm?: string
}

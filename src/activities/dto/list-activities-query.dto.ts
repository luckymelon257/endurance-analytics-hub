import { IsOptional, IsString, MaxLength } from 'class-validator'

export class ListActivitiesQueryDto {
  /** Opaque base64-encoded `<isoStartedAt>|<id>` cursor. First page omits. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  public cursor?: string
}

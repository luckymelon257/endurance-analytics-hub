import { Injectable, NestMiddleware } from '@nestjs/common'
import { NextFunction, Request, Response } from 'express'
import { ViteAssetsService } from './vite-assets.service'

@Injectable()
export class ViteAssetsMiddleware implements NestMiddleware {
  constructor(private readonly assets: ViteAssetsService) {}

  public use(_req: Request, res: Response, next: NextFunction): void {
    res.locals.viteHead = this.assets.headHtml()
    next()
  }
}

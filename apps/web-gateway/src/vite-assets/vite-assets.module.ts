import { Global, MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { ViteAssetsMiddleware } from './vite-assets.middleware'
import { ViteAssetsService } from './vite-assets.service'

@Global()
@Module({
  providers: [ViteAssetsService],
  exports: [ViteAssetsService],
})
export class ViteAssetsModule implements NestModule {
  public configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ViteAssetsMiddleware).forRoutes('*')
  }
}

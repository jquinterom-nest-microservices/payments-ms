import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true, // Hace que las variables estén disponibles en toda la app
    }),
    PaymentsModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PaymentSessionDto } from './dto';
import { Request, Response } from 'express';

@Injectable()
export class PaymentsService {
  private readonly stripe: Stripe;
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    const stripeSecret = this.configService.get<string>('STRIPE_SECRET');

    if (!stripeSecret) {
      throw new Error('STRIPE_SECRET is not defined in environment variables');
    }

    this.stripe = new Stripe(stripeSecret);

    this.logger.log('PaymentsService initialized');
    this.logger.debug(
      `Stripe Secret: ${stripeSecret ? 'Loaded' : 'Not loaded'}`,
    );
  }

  async createPaymentSession(paymentSessionDto: PaymentSessionDto) {
    const { currency, items, orderId } = paymentSessionDto;

    const lineItems = items.map((item) => {
      return {
        price_data: {
          currency: currency,
          product_data: {
            name: item.name,
          },
          unit_amount: Math.round(item.price * 100),
        },
        quantity: item.quantity,
      };
    });

    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_intent_data: {
          metadata: {
            orderId: orderId,
          },
        },
        line_items: lineItems,
        mode: 'payment',
        success_url: this.configService.get<string>('STRIPE_SUCCESS_URL'),
        cancel_url: this.configService.get<string>('STRIPE_CANCEL_URL'),
      });

      return session;
    } catch (error) {
      this.logger.error('Error creating payment session', error);
      throw error;
    }
  }

  async stripeWebhook(req: Request, res: Response) {
    const sig = req.headers['stripe-signature'] ?? '';

    let event: Stripe.Event;
    const endpointSecret =
      this.configService.get<string>('STRIPE_ENDPOINT_SECRET') ?? '';

    try {
      event = this.stripe.webhooks.constructEvent(
        req['rawBody'],
        sig,
        endpointSecret,
      );
    } catch (error) {
      res.status(400).send(`Webhook Error: ${error.message}`);
      return;
    }

    switch (event.type) {
      case 'charge.succeeded':
        const chargeSucceeded = event.data.object;
        this.logger.log('Payment intent succeeded');

        this.logger.debug({
          metadata: chargeSucceeded.metadata,
          orderId: chargeSucceeded.metadata.orderId,
        });
        break;
      case 'payment_intent.payment_failed':
        this.logger.warn('Payment intent payment failed');
        break;
      case 'payment_intent.canceled':
        this.logger.warn('Payment intent canceled');
        break;
      default:
        this.logger.warn(`Unknown event type: ${event.type}`);
        break;
    }

    return res.status(200).send(`Webhook called with signature ${sig}`);
  }
}

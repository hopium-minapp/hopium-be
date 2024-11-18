import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebSocket } from 'ws';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PRICE_EVENTS } from './constants/price';
import { sleep } from 'src/commons/utils/helper';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class PriceService implements OnModuleInit {
  private readonly BINANCE_SPOT_STREAMS_URL = 'wss://stream.binance.com:9443';
  private lastPrice = 0;
  private lastUpdated = Date.now();
  private logger = new Logger(PriceService.name);
  private readonly symbol = 'BTCUSDT';
  private stream1: WebSocket;
  private stream2: WebSocket;
  private restarting = false;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  onModuleInit() {
    this.startStreams();
    this.getPriceFromApi(this.symbol).then((price) => {
      this.lastPrice = price;
      this.lastUpdated = Date.now();
    });
  }

  @Cron('5 * * * *') // At minute 5 past every hour.
  async startStreams() {
    this.logger.log('Starting price streams');
    this.restarting = true;
    if (this.stream1) {
      this.stream1.close();
      this.stream1.terminate();
    }
    this.stream1 = this.startSymbolTickerStream(this.symbol);

    await sleep(1000);

    if (this.stream2) {
      this.stream2.close();
      this.stream2.terminate();
    }

    this.stream2 = this.startStreamPrice(this.symbol);
    await sleep(1000);

    this.restarting = false;
  }

  async getLastPrice() {
    if (Date.now() - this.lastUpdated > 5000) {
      this.lastPrice = await this.getPriceFromApi(this.symbol);
    }

    return this.lastPrice;
  }

  async getPriceFromApi(symbol: string) {
    const response = await fetch(
      `https://fapi.binance.com/fapi/v1/ticker/price?symbol=${symbol}`,
    );
    const data = await response.json();
    return parseFloat(data.price);
  }

  private startSymbolTickerStream(symbol: string, retry = 0) {
    symbol = symbol.toUpperCase();

    // TODO: Change to mini ticker stream
    const ws = new WebSocket(
      `${this.BINANCE_SPOT_STREAMS_URL}/ws/${symbol.toLowerCase()}@miniTicker`,
      {
        timeout: 5000,
      },
    );
    ws.on('ping', () => {
      this.logger.log('Binance ping!');
      ws.pong();
    });

    ws.on('error', () => {
      console.error(`${symbol} ticker stream error`);
    });

    ws.on('close', () => {
      if (!this.restarting) {
        this.logger.error(`${symbol} ticker stream closed`);
        setTimeout(() => {
          this.stream1 = this.startSymbolTickerStream(symbol, retry + 1);
        }, 500);
      }
    });

    ws.on('message', (payload: Buffer) => {
      try {
        const data = JSON.parse(String(payload));
        const price = parseFloat(data.c);
        if (price > 0) {
          this.processPriceStream(price);
        }
      } catch (error) {
        this.logger.error(
          'startSymbolTickerStream On Message Error',
          error.message,
        );
      }
    });
    return ws;
  }

  private startStreamPrice(symbol: string) {
    const ws = new WebSocket(`wss://stream.binance.com/stream`, {
      timeout: 5000,
    });
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    ws.on('open', () => {
      ws.send(
        JSON.stringify({
          method: 'SUBSCRIBE',
          params: [stream],
          id: 1,
        }),
      );
    });

    ws.on('ping', () => {
      ws.pong();
    });

    ws.on('error', () => {
      console.error(`${symbol} ticker stream error`);
    });

    ws.on('close', () => {
      if (!this.restarting) {
        this.logger.error(`${symbol} ticker stream closed`);
        setTimeout(() => {
          this.stream2 = this.startStreamPrice(symbol);
        }, 500);
      }
    });

    ws.on('message', (payload: Buffer) => {
      try {
        const data = JSON.parse(String(payload));
        if (data.stream === stream) {
          const price = parseFloat(data.data.p);
          this.processPriceStream(price);
        }
      } catch (error) {
        this.logger.error('startStreamPrice Error', error.message);
      }
    });
    return ws;
  }

  private processPriceStream(price: number) {
    try {
      this.lastUpdated = Date.now();
      if (this.lastPrice !== price) {
        this.eventEmitter.emit(PRICE_EVENTS.UPDATED, price);
      }
      this.lastPrice = price;
    } catch (error) {
      this.logger.error('processPriceStream Error', error.message);
    }
  }
}

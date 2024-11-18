import { Injectable } from '@nestjs/common';
import * as ages from '../assets/ages.json';

@Injectable()
export class CalculationScoreService {
  private ids: string[];
  private nids: number[];
  private minId: number;
  private maxId: number;
  private initScore = 500;
  private premiumScore = 500;

  constructor() {
    this.ids = Object.keys(ages);
    this.nids = this.ids.map((e) => parseInt(e));
    this.minId = this.nids[0];
    this.maxId = this.nids[this.nids.length - 1];
  }

  private getDate(id: number): [number, Date] {
    if (id < this.minId) {
      return [-1, new Date(ages[this.ids[0]])];
    } else if (id > this.maxId) {
      return [1, new Date(ages[this.ids[this.ids.length - 1]])];
    } else {
      let lid = this.nids[0];
      for (let i = 0; i < this.ids.length; i++) {
        if (id <= this.nids[i]) {
          const uid = this.nids[i];
          const lage = ages[lid];
          const uage = ages[uid];
          const idratio = (id - lid) / (uid - lid);
          const midDate = Math.floor(idratio * (uage - lage) + lage);
          return [0, new Date(midDate)];
        } else {
          lid = this.nids[i];
        }
      }
    }
  }

  calculateScore(id: number, isPremium: boolean): number {
    const d = this.getDate(id);
    const currentDate = new Date();
    const creationDate = d[1];
    const yearsDifference =
      currentDate.getUTCFullYear() - creationDate.getUTCFullYear();
    const randomScore = this.getRandomNumber(1, 99);
    let score = (yearsDifference + 1) * this.initScore + randomScore;
    if (isPremium) {
      score += this.premiumScore;
    }
    return score;
  }

  getRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

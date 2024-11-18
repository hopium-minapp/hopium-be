export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export function getRandomInt(min: number, max: number): number {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomInArray<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function round (value: number, precision: number) {
  const multiplier = Math.pow(10, precision || 0);
  return Math.round(value * multiplier) / multiplier;
}

export function generateHash() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// - Liên tiếp 1: x1
// - Liên tiếp 2: x2
// - Liên tiếp 3: x6
// - Liên tiếp 4: x8
// - Liên tiếp 5: x10
// - Liên tiếp 6: x12
// - Liên tiếp 7: x14
// - Liên tiếp 8: x16
// - Liên tiếp 9: x18
// - Liên tiếp 10: x20
export const WIN_STREAK_RATES = [0, 1, 2, 6, 8, 10, 12, 14, 16, 18, 20];

export const MAX_WIN_STREAK = WIN_STREAK_RATES.length - 1;

export const BONUS_USER_PARENT_RATES = {
  USER: 0.15,
  PARENT: 0.2,
};

export const TIME_CANCEL_PVP = 5 * 60 * 1000; // 5 minutes
export const TIME_PVP_DURATION = 5 * 1000; // 5 seconds

export const TAX_PVP = 0.05; // 5% tax

export const LINK_CHECK_BALANCE = 'https://t.me/hopium_official_bot/join';

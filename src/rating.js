// Elo untuk tunggal maupun ganda: rating tim = rata-rata rating pemainnya,
// dan setiap pemain dalam tim menerima perubahan yang sama.
export const INITIAL_RATING = 1000;
export const K_FACTOR = 32;

export function expectedScore(ratingA, ratingB) {
  return 1 / (1 + 10 ** ((ratingB - ratingA) / 400));
}

const average = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function matchDeltas(ratingsA, ratingsB, scoreA, scoreB) {
  const expectedA = expectedScore(average(ratingsA), average(ratingsB));
  const actualA = scoreA > scoreB ? 1 : 0;
  const delta = Math.round(K_FACTOR * (actualA - expectedA) * 10) / 10;
  return { deltaA: delta, deltaB: -delta };
}

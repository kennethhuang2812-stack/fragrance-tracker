// Search links: the Google Flights page the daily check reads, plus Skyscanner and airline sites
// for Ken to open himself. Shared by the app and the checker.

export function googleUrl(fromQ, toQ, date, backDate) {
  const q = backDate
    ? `Flights to ${toQ} from ${fromQ} on ${date} through ${backDate}`
    : `Flights to ${toQ} from ${fromQ} on ${date} one way`;
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&curr=AUD&hl=en-AU&gl=AU`;
}

// Skyscanner's codes for "any airport" in a city. Not checked by loading Skyscanner: its
// robots.txt disallows /transport/ for automated tools.
const SKY = { tokyo: 'tyoa', osaka: 'osaa', shanghai: 'csha', beijing: 'bjsa', guangzhou: 'can', shenzhen: 'szx' };
const sky = q => SKY[q.toLowerCase()] || q.toLowerCase();

export function skyscannerUrl(fromQ, toQ, date) {
  const yymmdd = date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10);
  return `https://www.skyscanner.com.au/transport/flights/${sky(fromQ)}/${sky(toQ)}/${yymmdd}/`;
}

const AIRLINES = {
  'Air New Zealand': 'https://www.airnewzealand.com.au/',
  'Qantas': 'https://www.qantas.com/au/en.html',
  'Virgin Australia': 'https://www.virginaustralia.com/au/en/',
  'Qatar Airways': 'https://www.qatarairways.com/en-au/homepage.html',
  'Emirates': 'https://www.emirates.com/au/english/',
  'JAL': 'https://www.jal.co.jp/au/en/',
  'ANA': 'https://www.ana.co.jp/en/au/',
  'Singapore Airlines': 'https://www.singaporeair.com/en_UK/au/home',
  'Cathay Pacific': 'https://www.cathaypacific.com/cx/en_AU.html',
  'China Eastern': 'https://au.ceair.com/',
  'China Southern': 'https://www.csair.com/au/en/',
  'Air China': 'https://www.airchina.com.au/',
};

/** The booking site of the first airline named ("Qantas and JAL" → Qantas), or null. */
export function airlineUrl(name) {
  for (const part of String(name || '').split(/ and |, /)) {
    if (AIRLINES[part.trim()]) return AIRLINES[part.trim()];
  }
  return null;
}

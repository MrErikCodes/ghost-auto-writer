import dotenv from 'dotenv';
dotenv.config();

export const config = {
  // OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,
  openaiModel: 'gpt-5.2',

  // Ghost CMS
  ghostApiUrl: process.env.API_URL + '/ghost/api/admin/',
  ghostAdminKey: process.env.ADMIN_API_KEY,

  // Site info
  siteUrl: 'https://minekvitteringer.no',
  siteName: 'Mine Kvitteringer',

  // RSS Feeds - Norwegian news sources
  rssFeeds: [
    { name: 'Tek.no', url: 'https://www.tek.no/api/rss/rss2/medium/collections' },
    { name: 'E24', url: 'https://e24.no/rss' },
    { name: 'Digi.no', url: 'https://www.digi.no/rss' },
    { name: 'ITavisen', url: 'https://itavisen.no/feed/' },
    { name: 'NRK Teknologi', url: 'https://www.nrk.no/teknologi/toppsaker.rss' },
    { name: 'VG Nyheter', url: 'https://www.vg.no/rss/feed/?categories=1069' },
  ],

  // Content categories for rotation
  categories: [
    'trending',
    'seo-gap',
    'store-guide',
    'business',
    'problem-solving',
    'life-situation',
    'feature-highlight',
    'seasonal',
    'ai-creative'
  ],

  // Norwegian stores to cover (comprehensive list)
  stores: [
    // Elektronikk
    'Elkjøp', 'Power', 'Komplett', 'NetOnNet', 'Kjell & Company', 'Expert', 'Lefdal',
    'Proshop', 'Multicom', 'Dustin Home',

    // Generelle varehus
    'Clas Ohlson', 'Jula', 'Biltema', 'Europris', 'Nille', 'Normal', 'Flying Tiger',
    'Søstrene Grene', 'Rusta', 'ÖoB',

    // Sport og fritid
    'XXL', 'Sport 1', 'Sportshuset', 'Anton Sport', 'G-Sport', 'Intersport',
    'Milslukern', 'Stadium', 'Løplabbet',

    // Møbler og interiør
    'IKEA', 'Skeidar', 'Bohus', 'Møbelringen', 'Living', 'Home & Cottage',
    'Kid Interiør', 'Jysk', 'Chili', 'A-Møbler', 'Fagmøbler', 'Møbel 1',

    // Byggevare og hage
    'Byggmax', 'Maxbo', 'Obs Bygg', 'Montér', 'Megaflis', 'Flisekompaniet',
    'Plantasjen', 'Hageland', 'Felleskjøpet',

    // Klær og mote
    'Zalando', 'Boozt', 'H&M', 'Cubus', 'Dressmann', 'Carlings', 'BikBok',
    'Volt', 'Match', 'Lindex', 'KappAhl', 'Jack & Jones', 'Vero Moda',
    'Gina Tricot', 'Stormberg', 'Bergans', 'Norrøna', 'Helly Hansen',

    // Sko
    'Eurosko', 'Skoringen', 'Din Sko', 'Footway', 'Brandos', 'Volt Footwear',

    // Dagligvare
    'Rema 1000', 'Kiwi', 'Meny', 'Spar', 'Coop Extra', 'Coop Obs', 'Coop Prix',
    'Coop Mega', 'Bunnpris', 'Joker', 'Nærbutikken',

    // Apotek og helse
    'Apotek 1', 'Boots Apotek', 'Vitus Apotek', 'Vitusapotek', 'Ditt Apotek',
    'Life', 'Sunkost',

    // Barn og baby
    'BabyVerden', 'Barnas Hus', 'Lekekassen', 'Jollyroom', 'Lekia', 'Toys R Us',
    'BR-leker', 'Norli',

    // Bokhandel og hobby
    'Ark', 'Norli', 'Notabene', 'Hobbyen', 'Panduro', 'Kreativt.no',

    // Gull og ur
    'Thune', 'Gullfunn', 'David Andersen', 'Mestergull', 'Bjørklund',
    'Urmaker Bjerke', 'Hour Passion',

    // Optikk
    'Specsavers', 'Brilleland', 'Synoptik', 'Synsam', 'Krogh Optikk',

    // Bil og transport
    'Biltema', 'Mekonomen', 'NAF-butikken', 'Dekk1', 'Vianor',

    // Mat og drikke
    'Vinmonopolet', 'Jacobs', 'Deli de Luca', 'Narvesen', '7-Eleven',

    // Telecom
    'Telenor', 'Telia', 'Ice', 'Phonero', 'OneCall', 'Chili Mobil',

    // Andre nettbutikker
    'Amazon.se', 'Wish', 'AliExpress', 'eBay', 'Finn.no', 'Tise',
    'ASOS', 'NA-KD', 'Nelly', 'Ellos', 'Stayhard',

    // Hvitevarer og kjøkken
    'Skousen', 'Elon', 'Kitchn', 'Tilbords', 'Cervera',

    // Hus og hjem
    'Princess', 'Kremmerhuset', 'Christiania Glasmagasin', 'Tilbords',
    'Hefty', 'Kremmerhuset',

    // Diverse
    'Jernia', 'Claes Ohlson', 'Teknikmagasinet', 'Coolstuff'
  ],

  // Default tag for Ghost posts
  defaultTag: 'Artikler',

  // Search Console data path
  searchConsolePath: './searchconsole'
};

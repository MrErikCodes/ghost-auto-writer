import { prepareBatch, runTurbo } from './claude-writer.js';
import { createPost } from './ghost-client.js';
import { saveGeneratedTopic } from './generated-topics.js';

const phoneTopics = [
  // iPhone 17 series
  {
    category: 'seo-gap',
    topic: 'iPhone 17 garanti i Norge: Alt du trenger å vite om garanti, reklamasjon og kjøpsbevis for hele iPhone 17-serien',
    query: 'iphone 17 garanti',
    keywords: ['iphone 17 garanti norge', 'iphone 17 reklamasjon', 'apple garanti 2026', 'iphone garanti hvor lang'],
    dataSource: 'manual',
    rationale: 'Ny lansering 2026 - stort søkevolum forventet for iPhone 17 garanti'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 Pro vs iPhone 17: Hvilken bør du velge, og hvorfor kvitteringen er viktigere enn du tror',
    query: 'iphone 17 pro vs iphone 17',
    keywords: ['iphone 17 pro', 'iphone 17 sammenligning', 'iphone 17 pris norge', 'beste iphone 2026'],
    dataSource: 'manual',
    rationale: 'Sammenligningsartikkel - høy søkeintensjon ved lansering'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 pris i Norge 2026: Komplett prisoversikt for alle modeller og hvor du finner best pris',
    query: 'iphone 17 pris norge',
    keywords: ['iphone 17 pris', 'iphone 17 pro pris', 'iphone 17 pro max pris', 'iphone 17 air pris', 'billigste iphone 17'],
    dataSource: 'manual',
    rationale: 'Pris-søk er blant de mest populære ved ny iPhone-lansering'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 Air: Apples tynneste telefon noensinne - spesifikasjoner, pris og garanti i Norge',
    query: 'iphone 17 air',
    keywords: ['iphone 17 air pris', 'iphone 17 air spesifikasjoner', 'iphone 17 air norge', 'apple iphone 17 air'],
    dataSource: 'manual',
    rationale: 'Helt ny modell i iPhone-serien - stor nysgjerrighet'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 Pro Max: Apples kraftigste telefon i 2026 - alt om garanti, forsikring og kvittering',
    query: 'iphone 17 pro max',
    keywords: ['iphone 17 pro max pris', 'iphone 17 pro max garanti', 'iphone 17 pro max norge', 'iphone 17 pro max spesifikasjoner'],
    dataSource: 'manual',
    rationale: 'Toppmodellen har alltid størst interesse og høyest pris'
  },
  {
    category: 'store-guide',
    topic: 'Kjøpe iPhone 17 i Norge: Elkjøp, Power eller Apple Store? Slik velger du riktig og sikrer kvitteringen',
    query: 'kjøpe iphone 17 norge',
    keywords: ['iphone 17 elkjøp', 'iphone 17 power', 'iphone 17 apple store', 'iphone 17 best pris'],
    dataSource: 'manual',
    rationale: 'Kombinerer butikkguide med produktsøk'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 vs Samsung S26: Den store sammenligningen 2026 - kamera, ytelse, garanti og pris',
    query: 'iphone 17 vs samsung s26',
    keywords: ['iphone vs samsung 2026', 'iphone 17 eller samsung s26', 'beste mobil 2026', 'samsung vs apple 2026'],
    dataSource: 'manual',
    rationale: 'Klassisk sammenligning - ekstremt populært hvert år'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 serie komplett oversikt 2026: Alle modeller, priser og spesifikasjoner i Norge',
    query: 'iphone 17 serie',
    keywords: ['iphone 17 modeller', 'iphone 17 oversikt', 'alle iphone 17', 'iphone 17 line-up 2026'],
    dataSource: 'manual',
    rationale: 'Oversiktsartikkel som fanger bredt søkevolum'
  },
  {
    category: 'problem-solving',
    topic: 'iPhone 17 reklamasjon: Slik går du frem hvis noe er galt med din nye iPhone',
    query: 'iphone 17 reklamasjon',
    keywords: ['reklamere iphone 17', 'iphone 17 feil', 'apple reklamasjon norge', 'iphone 17 problemer'],
    dataSource: 'manual',
    rationale: 'Problemløsning - høy konvertering til tjenesten'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 kamera: Slik tar du vare på bilder av kvitteringer med Apples beste kamera noensinne',
    query: 'iphone 17 kamera',
    keywords: ['iphone 17 kamera test', 'iphone 17 pro kamera', 'beste kameramobil 2026', 'iphone 17 kamerasampling'],
    dataSource: 'manual',
    rationale: 'Kamera er toppfunksjon - kobles til kvitteringsskanning'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 forsikring: Er det verdt det? Slik beskytter du din nye iPhone og dokumenterer kjøpet',
    query: 'iphone 17 forsikring',
    keywords: ['forsikring iphone 17', 'applecare iphone 17', 'mobilforsikring 2026', 'iphone forsikring norge'],
    dataSource: 'manual',
    rationale: 'Forsikring + dokumentasjon er kjerneområde for tjenesten'
  },
  {
    category: 'seo-gap',
    topic: 'Bytte fra Android til iPhone 17: Komplett guide for overgang, dataflytting og kvitteringshistorikk',
    query: 'bytte til iphone 17',
    keywords: ['android til iphone', 'bytte mobil 2026', 'flytte data til iphone 17', 'overgang samsung til iphone'],
    dataSource: 'manual',
    rationale: 'Mange bytter ved nye lanseringer - praktisk guide'
  },

  // Samsung Galaxy S26 series
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 garanti i Norge: Komplett guide til garanti, reklamasjon og kjøpsbevis',
    query: 'samsung s26 garanti',
    keywords: ['samsung galaxy s26 garanti', 'samsung garanti norge 2026', 'samsung reklamasjon', 'samsung garanti hvor lang'],
    dataSource: 'manual',
    rationale: 'Ny lansering 2026 - stort søkevolum for Samsung garanti'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 Ultra: Alt om Samsungs flaggskip 2026 - pris, garanti og kjøpsbevis i Norge',
    query: 'samsung s26 ultra',
    keywords: ['samsung galaxy s26 ultra pris', 'samsung s26 ultra norge', 'samsung s26 ultra spesifikasjoner', 'samsung flaggskip 2026'],
    dataSource: 'manual',
    rationale: 'Toppmodellen får alltid mest oppmerksomhet'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 pris i Norge 2026: Alle modeller, priser og beste tilbud',
    query: 'samsung s26 pris norge',
    keywords: ['samsung galaxy s26 pris', 'samsung s26 plus pris', 'samsung s26 ultra pris', 'samsung s26 billigst'],
    dataSource: 'manual',
    rationale: 'Pris-søk er blant de mest populære ved ny Samsung-lansering'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 vs S25: Er det verdt å oppgradere? Sammenligning av spesifikasjoner, kamera og pris',
    query: 'samsung s26 vs s25',
    keywords: ['samsung s26 vs s25', 'oppgradere samsung', 'samsung s26 forskjeller', 'er samsung s26 verdt det'],
    dataSource: 'manual',
    rationale: 'Oppgraderingsspørsmål er ekstremt populært'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 Plus: Mellommodellen som gir mest for pengene - pris, garanti og dokumentasjon',
    query: 'samsung s26 plus',
    keywords: ['samsung galaxy s26 plus', 'samsung s26 plus pris', 'samsung s26 plus norge', 'samsung s26+ spesifikasjoner'],
    dataSource: 'manual',
    rationale: 'Plus-modellen er populær mellomgrunn'
  },
  {
    category: 'store-guide',
    topic: 'Kjøpe Samsung S26 i Norge: Elkjøp, Power eller Samsung direkte? Slik sikrer du best pris og kvittering',
    query: 'kjøpe samsung s26 norge',
    keywords: ['samsung s26 elkjøp', 'samsung s26 power', 'samsung s26 best pris', 'samsung s26 tilbud'],
    dataSource: 'manual',
    rationale: 'Butikkguide kombinert med produktsøk'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 serie: Komplett oversikt over alle modeller, priser og spesifikasjoner i 2026',
    query: 'samsung galaxy s26 serie',
    keywords: ['samsung s26 modeller', 'samsung s26 oversikt', 'alle samsung s26', 'samsung 2026 telefoner'],
    dataSource: 'manual',
    rationale: 'Oversiktsartikkel for bredt søkevolum'
  },
  {
    category: 'problem-solving',
    topic: 'Samsung S26 reklamasjon: Slik reklamerer du og hvilken dokumentasjon du trenger',
    query: 'samsung s26 reklamasjon',
    keywords: ['reklamere samsung s26', 'samsung s26 feil', 'samsung service norge', 'samsung s26 problemer'],
    dataSource: 'manual',
    rationale: 'Problemløsning - høy konvertering til tjenesten'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 kamera: Galaxy AI og det beste mobilkameraet i 2026 for kvitteringer og dokumenter',
    query: 'samsung s26 kamera',
    keywords: ['samsung s26 kamera test', 'samsung s26 ultra kamera', 'beste kameramobil 2026 samsung', 'galaxy ai kamera'],
    dataSource: 'manual',
    rationale: 'Galaxy AI + kamera er hovedfokus - kobles til skanning'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 forsikring: Slik beskytter du din nye Samsung og dokumenterer alt riktig',
    query: 'samsung s26 forsikring',
    keywords: ['forsikring samsung s26', 'samsung care+', 'mobilforsikring samsung 2026', 'samsung forsikring norge'],
    dataSource: 'manual',
    rationale: 'Forsikring + dokumentasjon er kjerneområde'
  },
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy S26 Galaxy AI: Slik bruker du AI-funksjonene til å organisere kvitteringer og dokumenter',
    query: 'samsung s26 galaxy ai',
    keywords: ['galaxy ai funksjoner', 'samsung ai 2026', 'galaxy s26 ai', 'samsung ai kvitteringer'],
    dataSource: 'manual',
    rationale: 'Galaxy AI er Samsungs hovedfokus - aktuelt og søkbart'
  },

  // Google Pixel 10 series (launched Aug 2025)
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10 garanti i Norge: Alt du trenger å vite om Googles flaggskip med Tensor G5',
    query: 'google pixel 10 garanti',
    keywords: ['pixel 10 garanti norge', 'google garanti', 'pixel 10 reklamasjon', 'pixel garanti hvor lang'],
    dataSource: 'manual',
    rationale: 'Pixel 10 lansert aug 2025 - garanti-søk er populært'
  },
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10 vs Pixel 10 Pro: Hvilken Pixel bør du velge i 2026? Sammenligning av kamera, pris og garanti',
    query: 'pixel 10 vs pixel 10 pro',
    keywords: ['google pixel 10 pro', 'pixel 10 sammenligning', 'pixel 10 pro xl', 'beste pixel 2026'],
    dataSource: 'manual',
    rationale: 'Pixel 10 har tre modeller + fold - sammenligningsartikkel'
  },
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10 pris i Norge 2026: Alle modeller fra Pixel 10 til Pixel 10 Pro Fold',
    query: 'google pixel 10 pris norge',
    keywords: ['pixel 10 pris', 'pixel 10 pro pris', 'pixel 10 pro xl pris', 'pixel 10 pro fold pris'],
    dataSource: 'manual',
    rationale: 'Fra $799 - prisguide for norske kjøpere'
  },
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10 kamera: Trippel kamera, Qi2 og Tensor G5 - slik skanner du kvitteringer med Googles AI',
    query: 'google pixel 10 kamera',
    keywords: ['pixel 10 kamera test', 'pixel 10 kamera kvalitet', 'tensor g5', 'pixel 10 qi2'],
    dataSource: 'manual',
    rationale: 'Trippelkamera debuterer på standard Pixel - kobles til skanning'
  },
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10 Pro Fold: Googles brettemobil med garanti og dokumentasjon i Norge',
    query: 'pixel 10 pro fold',
    keywords: ['google pixel fold', 'pixel 10 pro fold pris', 'brettemobil google', 'foldbar mobil 2026'],
    dataSource: 'manual',
    rationale: 'Ny foldbar modell fra Google - vekker nysgjerrighet'
  },

  // OnePlus 15 (launched Dec 2025)
  {
    category: 'seo-gap',
    topic: 'OnePlus 15 i Norge: 7300 mAh batteri, 165Hz skjerm og garanti - alt du trenger å vite',
    query: 'oneplus 15 norge',
    keywords: ['oneplus 15 garanti', 'oneplus 15 pris norge', 'oneplus 15 spesifikasjoner', 'oneplus 15 batteri'],
    dataSource: 'manual',
    rationale: 'OnePlus 15 lansert des 2025 - 7300mAh batteri er rekord'
  },
  {
    category: 'seo-gap',
    topic: 'OnePlus 15 garanti og reklamasjon i Norge: Slik dokumenterer du kjøpet og bruker garantien',
    query: 'oneplus 15 garanti',
    keywords: ['oneplus garanti norge', 'oneplus reklamasjon', 'oneplus 15 service', 'oneplus garanti tid'],
    dataSource: 'manual',
    rationale: 'OnePlus har begrenset service i Norge - viktig å dokumentere'
  },
  {
    category: 'seo-gap',
    topic: 'OnePlus 15 vs Samsung S26 vs iPhone 17: Flaggskipene sammenlignet på pris, kamera og garanti',
    query: 'oneplus 15 vs samsung s26',
    keywords: ['oneplus vs samsung 2026', 'oneplus 15 vs iphone 17', 'beste flaggskip 2026', 'oneplus 15 sammenligning'],
    dataSource: 'manual',
    rationale: 'Treveis sammenligning mellom alle 2026-flaggskip'
  },

  // Nothing Phone 3a (2025)
  {
    category: 'seo-gap',
    topic: 'Nothing Phone 3a i Norge: Den beste budsjettmobilen 2025/2026 med unik design og garanti',
    query: 'nothing phone 3a norge',
    keywords: ['nothing phone 3a pris', 'nothing phone garanti', 'nothing phone 3a pro', 'nothing telefon norge'],
    dataSource: 'manual',
    rationale: 'Nothing Phone 3a er en av de beste budsjettmobilene - populær i Norge'
  },
  {
    category: 'seo-gap',
    topic: 'Nothing Phone 3a garanti og reklamasjon: Slik sikrer du deg når du kjøper en Nothing-telefon i Norge',
    query: 'nothing phone garanti',
    keywords: ['nothing phone reklamasjon', 'nothing phone service norge', 'nothing phone 3a feil', 'nothing telefon garanti'],
    dataSource: 'manual',
    rationale: 'Nothing er nytt merke - mange spørsmål om garanti i Norge'
  },

  // Sony Xperia 1 VII (2025)
  {
    category: 'seo-gap',
    topic: 'Sony Xperia 1 VII: Mobilkamera for profesjonelle - garanti, pris og kjøpsbevis i Norge',
    query: 'sony xperia 1 vii norge',
    keywords: ['sony xperia garanti', 'sony xperia 1 vii pris', 'sony mobil norge', 'xperia kamera'],
    dataSource: 'manual',
    rationale: 'Sony Xperia 1 VII lansert mai 2025 - unikt kamerafokus'
  },
  {
    category: 'seo-gap',
    topic: 'Sony Xperia 1 VII garanti og reklamasjon i Norge: Komplett guide til Sonys mobilgaranti',
    query: 'sony xperia garanti',
    keywords: ['sony garanti norge', 'sony mobil reklamasjon', 'xperia 1 vii garanti', 'sony service norge'],
    dataSource: 'manual',
    rationale: 'Sony er nisjemerke i Norge - viktig å dokumentere garantien'
  },

  // Motorola Razr Ultra 2025
  {
    category: 'seo-gap',
    topic: 'Motorola Razr Ultra 2025: Brettemobilen som utfordrer Samsung Flip - garanti og kjøpsbevis i Norge',
    query: 'motorola razr ultra 2025',
    keywords: ['motorola razr garanti', 'motorola razr pris norge', 'brettemobil 2025', 'motorola razr ultra'],
    dataSource: 'manual',
    rationale: 'Motorola Razr Ultra 2025 slo Samsung Flip på flere punkter'
  },

  // Xiaomi 15 Ultra
  {
    category: 'seo-gap',
    topic: 'Xiaomi 15 Ultra i Norge: 1-tommers kamerasensor, 200MP telefoto og garanti du bør vite om',
    query: 'xiaomi 15 ultra norge',
    keywords: ['xiaomi 15 ultra pris', 'xiaomi garanti norge', 'xiaomi 15 ultra kamera', 'xiaomi mobil garanti'],
    dataSource: 'manual',
    rationale: 'Xiaomi 15 Ultra har verdens beste mobilkamera - vokser i Norge'
  },
  {
    category: 'seo-gap',
    topic: 'Xiaomi garanti og reklamasjon i Norge 2026: Alt du trenger å vite om Xiaomi-garantien',
    query: 'xiaomi garanti norge',
    keywords: ['xiaomi reklamasjon', 'xiaomi service norge', 'xiaomi garanti tid', 'xiaomi 15 garanti'],
    dataSource: 'manual',
    rationale: 'Xiaomi vokser raskt - mange spørsmål om garanti i Norge'
  },

  // Samsung Galaxy Z Flip 7 / Z Fold 7
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy Z Flip 7 og Z Fold 7: Alt om Samsungs brettemobiler i 2026 - garanti og dokumentasjon',
    query: 'samsung z flip 7 garanti',
    keywords: ['samsung z fold 7', 'samsung brettemobil garanti', 'galaxy z flip 7 pris', 'samsung fold garanti norge'],
    dataSource: 'manual',
    rationale: 'Brettemobiler har spesielle garantispørsmål - populært søk'
  },

  // Google Pixel 10a (coming 2026)
  {
    category: 'seo-gap',
    topic: 'Google Pixel 10a: Googles rimeligste telefon i 2026 - pris, spesifikasjoner og garanti i Norge',
    query: 'google pixel 10a',
    keywords: ['pixel 10a pris', 'pixel 10a norge', 'pixel 10a spesifikasjoner', 'billig google telefon'],
    dataSource: 'manual',
    rationale: 'Pixel a-serien er ekstremt populær som budsjettvalg'
  },

  // Samsung Galaxy A-series 2026
  {
    category: 'seo-gap',
    topic: 'Samsung Galaxy A56 og A36: De bestselgende Samsung-telefonene i 2026 - garanti og kvittering',
    query: 'samsung galaxy a56 garanti',
    keywords: ['samsung a56 pris', 'samsung a36 garanti', 'samsung a-serie 2026', 'billig samsung 2026'],
    dataSource: 'manual',
    rationale: 'Samsung A-serien selger mest - garanti-spørsmål er vanlige'
  },

  // Brettemobiler oversikt
  {
    category: 'seo-gap',
    topic: 'Brettemobiler i 2026: Samsung Fold, Google Pixel Fold, Motorola Razr - garanti og hva du bør vite',
    query: 'brettemobil 2026',
    keywords: ['foldbar mobil garanti', 'beste brettemobil 2026', 'samsung fold vs pixel fold', 'brettemobil norge'],
    dataSource: 'manual',
    rationale: 'Brettemobiler vokser - spesielle garantihensyn for skjermen'
  },

  // Cross-comparison and general phone articles
  {
    category: 'seo-gap',
    topic: 'Beste mobiltelefon 2026: iPhone 17 vs Samsung S26 vs Google Pixel 10 - komplett kjøpsguide',
    query: 'beste mobil 2026',
    keywords: ['beste telefon 2026', 'beste mobiltelefon 2026 norge', 'hvilken mobil 2026', 'mobiltest 2026'],
    dataSource: 'manual',
    rationale: 'Årlig bestselger-søkeord med enormt volum'
  },
  {
    category: 'seo-gap',
    topic: 'Mobilgaranti i Norge 2026: Komplett oversikt for iPhone 17, Samsung S26 og alle populære merker',
    query: 'mobilgaranti 2026',
    keywords: ['garanti mobil 2026', 'garanti telefon norge', 'reklamasjon mobil', 'hvor lang garanti mobil'],
    dataSource: 'manual',
    rationale: 'Garanti-søk øker massivt etter nye lanseringer'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 og Samsung S26 tilbehør: Slik tar du vare på kvitteringene for deksler, lader og skjermbeskyttere',
    query: 'iphone 17 samsung s26 tilbehør',
    keywords: ['mobiltilbehør 2026', 'iphone 17 deksel', 'samsung s26 tilbehør', 'garanti tilbehør mobil'],
    dataSource: 'manual',
    rationale: 'Tilbehør genererer mange ekstra kvitteringer'
  },
  {
    category: 'seo-gap',
    topic: 'Beste budsjettmobil 2026: Rimelige alternativer til iPhone 17 og Samsung S26 med god garanti',
    query: 'beste budsjettmobil 2026',
    keywords: ['billig mobil 2026', 'budsjett telefon 2026', 'rimelig mobil norge', 'god mobil under 5000'],
    dataSource: 'manual',
    rationale: 'Budsjett-søk er populært når flaggskip blir dyrere'
  },
  {
    category: 'seo-gap',
    topic: 'Selge gammel mobil når du kjøper iPhone 17 eller Samsung S26: Slik dokumenterer du salget riktig',
    query: 'selge gammel mobil 2026',
    keywords: ['selge brukt mobil', 'selge iphone', 'selge samsung', 'kvittering brukt mobil salg'],
    dataSource: 'manual',
    rationale: 'Mange selger gammel mobil ved oppgradering'
  },
  {
    category: 'seo-gap',
    topic: 'Mobilabonnement for iPhone 17 og Samsung S26: Telenor, Telia eller Ice? Slik velger du og lagrer fakturaen',
    query: 'mobilabonnement 2026',
    keywords: ['beste mobilabonnement 2026', 'mobilabonnement iphone 17', 'mobilabonnement samsung s26', 'telenor telia ice 2026'],
    dataSource: 'manual',
    rationale: 'Abonnement-valg følger telefonkjøp'
  },
  {
    category: 'seo-gap',
    topic: 'iPhone 17 og Samsung S26 som firmatelefon: Fradrag, dokumentasjon og regler for enkeltpersonforetak',
    query: 'firmatelefon 2026',
    keywords: ['firmatelefon enkeltpersonforetak', 'fradrag mobiltelefon firma', 'firmamobil regler 2026', 'mobil fradrag enk'],
    dataSource: 'manual',
    rationale: 'Business-vinkel - kobler til ENK-segmentet'
  },
];

async function main() {
  const model = process.argv.includes('--model')
    ? process.argv[process.argv.indexOf('--model') + 1]
    : 'opus';
  const parallel = 15;

  console.log(`\n📱 PHONE LAUNCH ARTICLES`);
  console.log('='.repeat(50));
  console.log(`${phoneTopics.length} articles | model: ${model} | parallel: ${parallel}`);
  console.log('='.repeat(50) + '\n');

  // Prepare batch
  const batchDir = prepareBatch(phoneTopics);

  // Test Ghost connection
  const { testConnection } = await import('./ghost-client.js');
  const connected = await testConnection();

  if (!connected) {
    console.log('❌ Ghost offline. Articles will be saved to disk.');
  }

  // Run turbo pipeline
  const postFn = connected ? async (article, topicInfo) => {
    const post = await createPost(article, true);
    console.log(`  🌐 Published: ${post.title}`);
    await saveGeneratedTopic({
      ...topicInfo,
      title: article.title,
      ghostPostId: post.id
    });
  } : null;

  const result = await runTurbo(batchDir, { parallel, model, view: false, postFn });

  console.log(`\n📱 Phone articles done: ${result.generated} generated, ${result.posted} posted, ${result.failed} failed\n`);
}

main().catch(console.error);

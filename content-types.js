import { config } from "./config.js";

// Content category definitions with topic generators
export const contentTypes = {
  // Category 1: Trending news and current events
  trending: {
    name: "Trending",
    description:
      "Current news about phones, electronics, insurance, consumer rights",
    examples: [
      "Ny iPhone 17 lansert - dette betyr det for garantien din",
      "Forbrukerrådet advarer: Nye regler for netthandel",
      "Black Friday 2025: Slik sikrer du kvitteringene",
    ],
  },

  // Category 2: SEO gap opportunities
  "seo-gap": {
    name: "SEO Gap",
    description:
      "Keywords with high impressions but low clicks - opportunity content",
    examples: [
      "Power kvittering - slik finner du den",
      "Kvitteringshåndtering for bedrifter",
      "Firmabil enkeltpersonforetak dokumentasjon",
    ],
  },

  // Category 3: Store-specific guides
  "store-guide": {
    name: "Store Guide",
    description:
      "How to find and manage receipts from specific Norwegian stores",
    topics: config.stores.map((store) => ({
      store: store,
      angles: [
        `Slik finner du kvitteringer fra ${store}`,
        `${store} Min Side funker ikke? Her er løsningen`,
        `Alt om garanti og retur hos ${store}`,
        `${store} kvitteringer rett til minekvitteringer.no`,
      ],
    })),
  },

  // Category 4: Business and self-employed content
  business: {
    name: "Business/ENK",
    description:
      "Content for businesses and self-employed (enkeltpersonforetak)",
    topics: [
      "Kvitteringer for enkeltpersonforetak - komplett guide",
      "MVA-dokumentasjon: Hvilke kvitteringer trenger du?",
      "Firmabil og kjøregodtgjørelse - slik dokumenterer du riktig",
      "Hjemmekontor fradrag - kvitteringene du må ha",
      "Regnskapsfører krever kvitteringer - lever alt på sekunder",
      "Ansattutlegg uten stress - del kvitteringer med økonomiavdelingen",
      "Selvstendig næringsdrivende: Spar timer på kvitteringshåndtering",
      "Reiseutgifter i ENK - dokumentasjonskrav",
      "Skattefradrag enkeltpersonforetak - dette kan du trekke fra",
      "Oppbevaringsplikt for regnskap - hvor lenge må du lagre?",
    ],
  },

  // Category 5: Problem-solving content
  "problem-solving": {
    name: "Problem Solving",
    description: "Addressing common receipt and warranty problems",
    topics: [
      "Mistet kvittering - hva gjør du nå?",
      "Kvitteringen har bleknet - er den fortsatt gyldig?",
      "Reklamasjon uten kvittering - dine rettigheter",
      "5 butikker, 5 innlogginger - slutt å lete etter kvitteringer",
      "Butikken la ned - hvor er kvitteringene mine?",
      "E-poster slettes, papir blekner - sikker lagring av kvitteringer",
      "Elkjøp Min Side funker ikke - slik sikrer du kvitteringene",
      "Clas Ohlson-appen viser ikke gamle kjøp - her er løsningen",
      "Zalando sletter ordrehistorikk - slik beholder du oversikten",
      "Nettbutikken gikk konkurs - kvitteringene dine er borte. Med mindre...",
    ],
  },

  // Category 6: Life situation content
  "life-situation": {
    name: "Life Situations",
    description: "Receipts and warranties in different life situations",
    topics: [
      "Flytte sammen? Del kvitteringer for felles kjøp",
      "Skilsmisse og fordeling - kvitteringer som dokumentasjon",
      "Forsikringsskade: Finn alle kvitteringer på 30 sekunder",
      "Arveoppgjør: Dokumenter verdier med kvitteringer",
      "Flytting til ny bolig - kvitteringer du trenger for innboforsikring",
      "Bryllup og store kjøp - hold orden på garantier",
      "Studenter: Slik holder du orden på kvitteringer fra dag én",
      "Pensjonist? Digital kvitteringslagring er enklere enn du tror",
      "Boligkjøp: Dokumenter alt fra første visning",
      "Bil solgt eller kjøpt? Kvitteringer for service og vedlikehold",
    ],
  },

  // Category 7: Feature highlight content
  "feature-highlight": {
    name: "Feature Highlight",
    description: "Showcasing minekvitteringer.no features",
    topics: [
      "Vipps-innlogging: Aldri husk passord igjen",
      "Del kvitteringer med familie - slik fungerer det",
      "Søk i alle kvitteringer med ett klikk",
      "Videresend kvitteringer på e-post - automatisk lagring",
      "Automatisk import av kvitteringer fra e-post - koble til din e-postkonto og lagre kvitteringene helt enkelt",
      "OCR-skanning: Aldri skriv inn data manuelt igjen",
      "Kvitteringer på mobil, nettbrett og PC - alltid tilgjengelig",
      "Smart kategorisering - finn det du leter etter",
      "Sikker skylagring - dine data er trygge",
      "Eksporter kvitteringer til regnskapet",
      "Bulk-opplasting: Last opp 200 kvitteringer på en gang",
    ],
  },

  // Category 8: Seasonal content
  seasonal: {
    name: "Seasonal",
    description: "Time-sensitive content based on season/events",
    topics: [
      { month: 1, topic: "Nyttårsforsetter: Få orden på kvitteringene i 2026" },
      {
        month: 2,
        topic:
          "Vinterferie-kjøp: Ski, klær og elektronikk - husk kvitteringene",
      },
      {
        month: 3,
        topic: "Skattemeldingen 2026: Kvitteringene du trenger fra 2025",
      },
      { month: 4, topic: "Påskesalg 2026: Slik sikrer du kvitteringene" },
      {
        month: 5,
        topic:
          "17. mai-forberedelser: Bunad og festklær - garanti og kvittering",
      },
      { month: 6, topic: "Sommersalg 2026: Handle smart, lagre kvitteringer" },
      { month: 7, topic: "Ferie-shopping: Kvitteringer fra utlandet" },
      {
        month: 8,
        topic: "Skolestart 2026: Alt du handler - én app for kvitteringene",
      },
      {
        month: 9,
        topic: "Høstoppussing: Kvitteringer for byggevarer og møbler",
      },
      {
        month: 10,
        topic: "Høstsalg og elektronikk - Black Week 2026 nærmer seg",
      },
      {
        month: 11,
        topic: "Black Friday 2026: Slik holder du orden på alle kvitteringene",
      },
      {
        month: 12,
        topic: "Julegaver 2026: Garanti og bytterett - behold kvitteringene",
      },
    ],
  },

  // Category 9: AI Creative - Pure AI-driven ideas
  "ai-creative": {
    name: "AI Creative",
    description:
      "Original ideas from AI based on market understanding, trends, and creative thinking. Not bound by predefined topics - the AI suggests what it thinks will resonate with readers.",
    examples: [
      "Unexpected topics AI identifies as relevant",
      "Cross-industry insights about documentation",
      "Future trends in consumer rights",
      "Creative angles on everyday receipt situations",
    ],
  },
};

// Get a random topic from a category
export function getRandomTopicFromCategory(category) {
  const type = contentTypes[category];
  if (!type || !type.topics) return null;

  if (category === "store-guide") {
    const store = type.topics[Math.floor(Math.random() * type.topics.length)];
    const angle = store.angles[Math.floor(Math.random() * store.angles.length)];
    return { category, store: store.store, topic: angle };
  }

  if (category === "seasonal") {
    const currentMonth = new Date().getMonth() + 1;
    const seasonalTopic = type.topics.find((t) => t.month === currentMonth);
    return seasonalTopic
      ? { category, topic: seasonalTopic.topic }
      : {
          category,
          topic:
            type.topics[Math.floor(Math.random() * type.topics.length)].topic,
        };
  }

  const topic = type.topics[Math.floor(Math.random() * type.topics.length)];
  return { category, topic };
}

// Get all categories in rotation order
export function getCategoryRotation() {
  return config.categories;
}

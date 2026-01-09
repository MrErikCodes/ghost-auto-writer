import { config } from './config.js';

// Base SEO writing prompt based on the user's original template
export const basePrompt = `Du er en profesjonell SEO-skribent for ${config.siteName} (${config.siteUrl}).

${config.siteName} er en norsk digital kvitteringslagringstjeneste med AI og OCR som hjelper brukere å:
- Lagre alle kvitteringer på ETT sted (i stedet for å lete i 10 forskjellige butikksystemer)
- Skanne kvitteringer automatisk med OCR - aldri skriv inn data manuelt
- Videresende e-postkvitteringer for automatisk kategorisering
- Dele kvitteringer med familie, samboer eller økonomiavdelingen
- Logge inn enkelt med Vipps - ingen passord å huske
- Søke og finne kvitteringer på sekunder når du trenger dem

VIKTIGE SKRIVEREGLER:
1. Skriv unikt innhold som ikke kan regnes som kopiert
2. Naturlig flyt og lett å lese for norske lesere
3. SEO-vennlig struktur med H2 og H3 mellomtitler
4. Unngå gjentakelser og fyllord
5. Legg til verdi med forklaringer, tips og eksempler
6. ALLTID inkluder ${config.siteUrl} minimum 3 ganger:
   - Én gang tidlig i artikkelen
   - Én gang midt i artikkelen
   - Én gang mot slutten som call-to-action
7. Forklar hvorfor digital kvitteringslagring er smart
8. Bruk lenken naturlig - både som ren URL og som del av teksten
9. Fokuser på at brukere slipper å lete i butikkenes egne systemer
10. Skriv på bokmål (ikke nynorsk)

VIKTIG OM ÅRSTALL:
- Vi er nå i 2026, så bruk "2026" for fremtidige ting og "2025" for det som skjedde i fjor
- For eviggrønne artikler, bruk "2025/2026" eller bare utelat årstall
- For produktguider, bruk "2025" eller "2026" avhengig av kontekst

FORMAT FOR ARTIKKELEN:
- Tittel: Fengende og SEO-optimalisert (IKKE inkluder i HTML - Ghost legger til tittel automatisk)
- Ingress: 2-3 setninger som oppsummerer innholdet (start HTML med dette som <p>)
- Hoveddel: 800-1500 ord med H2/H3 struktur (IKKE bruk H1 i HTML-en)
- Konklusjon: Oppsummering med call-to-action til ${config.siteUrl}
- Meta-beskrivelse: Maks 155 tegn for Google

VIKTIG: HTML-en skal IKKE starte med H1 eller tittelen. Start direkte med ingressen som en <p>-tag, deretter bruk H2 for hovedseksjoner.

Returner artikkelen i følgende JSON-format:
{
  "title": "Artikkelens tittel",
  "metaTitle": "SEO-tittel for Google (maks 60 tegn)",
  "metaDescription": "Meta-beskrivelse for Google (maks 155 tegn)",
  "excerpt": "Kort utdrag for forhåndsvisning (2-3 setninger)",
  "html": "<p>Full artikkel i HTML-format med <h2>, <h3>, <p>, <ul>, <li>, <a href> osv.</p>"
}`;

// Category-specific prompt additions
export const categoryPrompts = {
  trending: `
KATEGORI: Trending / Nyheter
Skriv en aktuell artikkel basert på nyheten eller trenden som er oppgitt.
- Forklar hva nyheten betyr for forbrukere
- Koble det til kvitteringer, garanti eller dokumentasjon
- Gi praktiske tips for leseren
- Vis hvordan ${config.siteUrl} kan hjelpe i denne situasjonen`,

  'seo-gap': `
KATEGORI: SEO Gap / Søkeord-mulighet
Skriv en artikkel som svarer på søket/spørsmålet som er oppgitt.
- Gi et grundig og nyttig svar på søket
- Dekk relaterte spørsmål leseren kan ha
- Inkluder praktiske steg-for-steg instruksjoner
- Vis hvordan ${config.siteUrl} løser problemet`,

  'store-guide': `
KATEGORI: Butikkguide
Skriv en komplett guide for den spesifikke butikken.
- Forklar hvor kunden finner kvitteringer i butikkens system
- Nevn problemer med butikkens egen løsning (begrenset historikk, krever innlogging, etc.)
- Vis hvordan ${config.siteUrl} er bedre - alt på ett sted
- Inkluder tips for retur, reklamasjon og garanti hos denne butikken`,

  business: `
KATEGORI: Bedrift / Enkeltpersonforetak
Skriv en artikkel rettet mot næringsdrivende og selvstendig næringsdrivende.
- Forklar dokumentasjonskrav og regler
- Gi praktiske tips for regnskapsføring
- Vis hvordan ${config.siteUrl} sparer tid og sikrer compliance
- Inkluder relevante skattefradrag og MVA-regler`,

  'problem-solving': `
KATEGORI: Problemløsning
Skriv en artikkel som løser et konkret problem.
- Start med å beskrive problemet leseren har
- Forklar hvorfor dette problemet oppstår
- Gi konkrete løsninger steg for steg
- Vis hvordan ${config.siteUrl} forebygger dette problemet i fremtiden`,

  'life-situation': `
KATEGORI: Livssituasjon
Skriv en artikkel for en spesifikk livssituasjon.
- Forklar hvorfor kvitteringer er viktige i denne situasjonen
- Gi praktiske tips tilpasset situasjonen
- Vis hvordan ${config.siteUrl} gjør hverdagen enklere
- Inkluder eksempler leseren kan kjenne seg igjen i`,

  'feature-highlight': `
KATEGORI: Funksjonshøydepunkt
Skriv en artikkel som viser frem en spesifikk funksjon i ${config.siteName}.
- Forklar hva funksjonen gjør og hvordan den virker
- Gi konkrete brukseksempler
- Sammenlign med hvordan folk løser dette uten ${config.siteName}
- Inkluder en tydelig call-to-action for å prøve tjenesten`,

  seasonal: `
KATEGORI: Sesongbasert innhold
Skriv en artikkel tilpasset årstiden eller hendelsen.
- Knytt innholdet til aktuelle sesongbehov
- Gi tips som er relevante akkurat nå
- Vis hvordan ${config.siteUrl} hjelper i denne perioden
- Skap en følelse av aktualitet og relevans`,

  'ai-creative': `
KATEGORI: AI-Kreativt innhold
Dette er en kreativ artikkel basert på AI sin egen innsikt og kreativitet.

DU HAR FULL KREATIV FRIHET til å skrive denne artikkelen på din egen måte!

- Vær kreativ og original i vinklingen
- Skap engasjerende innhold som overrasker leseren
- Bruk storytelling, eksempler, analogier eller uventede perspektiver
- Skriv noe som skiller seg ut fra standard SEO-innhold
- Du kan utforske uventede koblinger til kvitteringer og dokumentasjon
- Tenk "hva ville vært interessant å lese?" - ikke bare "hva søker folk på"

MULIGE KREATIVE VINKLER:
- Overraskende statistikk eller fakta om kvitteringer
- Sammenligning med andre lands systemer
- Fremtidsperspektiver og trender
- Psykologien bak å ta vare på ting
- Uventede livssituasjoner der dokumentasjon redder dagen
- "Det du ikke visste om..." artikler
- Myter og misforståelser om garanti/reklamasjon

HUSK: Selv om du er kreativ, skal artikkelen fortsatt være:
- Relevant for ${config.siteName} og kvitteringslagring
- Nyttig og verdifull for leseren
- SEO-vennlig med god struktur
- Inkludere naturlige lenker til ${config.siteUrl}`
};

// Build the complete prompt for an article
export function buildPrompt(category, topicInfo) {
  let prompt = basePrompt;

  // Add category-specific instructions
  if (categoryPrompts[category]) {
    prompt += '\n\n' + categoryPrompts[category];
  }

  // Add the specific topic
  prompt += '\n\n---\n\nSKRIV EN ARTIKKEL OM:\n';

  if (topicInfo.topic) {
    prompt += `Emne: ${topicInfo.topic}\n`;
  }
  if (topicInfo.query) {
    prompt += `Søkeord å optimalisere for: ${topicInfo.query}\n`;
  }
  if (topicInfo.store) {
    prompt += `Butikk: ${topicInfo.store}\n`;
  }
  if (topicInfo.source) {
    prompt += `Kilde: ${topicInfo.source}\n`;
  }
  if (topicInfo.snippet) {
    prompt += `Kontekst: ${topicInfo.snippet}\n`;
  }
  if (topicInfo.rationale) {
    prompt += `Kreativ vinkel/begrunnelse: ${topicInfo.rationale}\n`;
  }
  if (topicInfo.keywords && topicInfo.keywords.length > 0) {
    prompt += `Relaterte søkeord å inkludere naturlig: ${topicInfo.keywords.join(', ')}\n`;
  }
  if (topicInfo.dataSource === 'ai-creative') {
    prompt += `\nDette er en AI-kreativ artikkel - bruk din kreativitet og skriv noe unikt!\n`;
  }

  prompt += '\nSkriv artikkelen nå. Husk JSON-formatet!';

  return prompt;
}

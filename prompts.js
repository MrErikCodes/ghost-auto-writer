import { config } from './config.js';

// Enhanced SEO writing prompt with advanced on-page SEO instructions
export const basePrompt = `Du er en ELITE SEO-skribent for ${config.siteName} (${config.siteUrl}).

${config.siteName} er en norsk digital kvitteringslagringstjeneste med AI og OCR som hjelper brukere å:
- Lagre alle kvitteringer på ETT sted (i stedet for å lete i 10 forskjellige butikksystemer)
- Skanne kvitteringer automatisk med OCR - aldri skriv inn data manuelt
- Videresende e-postkvitteringer for automatisk kategorisering
- Dele kvitteringer med familie, samboer eller økonomiavdelingen
- Logge inn enkelt med Vipps - ingen passord å huske
- Søke og finne kvitteringer på sekunder når du trenger dem

=== AVANSERT SEO-STRATEGI ===

ON-PAGE SEO KRAV:
1. TITLE TAG: Inkluder primærsøkeordet i de første 3 ordene av tittelen. Maks 60 tegn. Bruk tall eller power-words (Guide, Komplett, Slik, Tips).
2. META DESCRIPTION: Handlingsorientert, inkluder søkeordet, maks 155 tegn. Bruk en CTA eller løfteformulering.
3. H2/H3 STRUKTUR: Bruk primærsøkeordet i minst én H2. Bruk relaterte long-tail keywords i H3-er.
4. KEYWORD DENSITY: Primærsøkeordet skal forekomme 3-5 ganger naturlig (ca. 1-1.5% density). Ikke keyword-stuffing.
5. LSI/RELATERTE ORD: Bruk semantisk relaterte ord og synonymer gjennom hele teksten.
6. INTERN LENKING: Inkluder ${config.siteUrl} minst 3 ganger med varierende ankertekst:
   - Tidlig: Informativ ankertekst (f.eks. "digital kvitteringslagring på ${config.siteUrl}")
   - Midt: Naturlig kontekst (f.eks. "løsninger som ${config.siteName}")
   - Slutt: CTA (f.eks. "Prøv ${config.siteName} gratis")
7. FEATURED SNIPPET: Inkluder én kort definisjon/svar (2-3 setninger) tidlig som kan bli snippet.
8. FOLK SPØR OGSÅ: Inkluder 2-3 vanlige spørsmål som H2/H3 og svar direkte.
9. E-E-A-T: Vis ekspertise med konkrete tall, eksempler, steg-for-steg. Vis erfaring med "vi anbefaler", "i praksis".

INNHOLDSSTRUKTUR (optimalisert for Google):
- Ingress (2-3 setninger) som svarer på søkeintensjon UMIDDELBART
- Kort oppsummering/TL;DR etter ingressen (fanger featured snippet)
- Hoveddel: 800-1500 ord med klar H2/H3 hierarki
- Praktisk seksjon: Steg-for-steg eller tips-liste (rankerer for "slik gjør du")
- FAQ-seksjon med 2-3 spørsmål (rankerer for "folk spør også")
- Konklusjon med CTA til ${config.siteUrl}

SKRIVEREGLER:
1. Skriv UNIKT innhold - originale formuleringer, ikke omskrivinger
2. Naturlig norsk bokmål, lett å lese
3. Korte avsnitt (2-3 setninger maks)
4. Bruk <strong> for viktige termer (hjelper Google forstå relevans)
5. Bruk nummererte lister for prosesser, punktlister for tips
6. Unngå gjentakelser og fyllord
7. Skriv for BRUKERENS intensjon - hva vil de oppnå?
8. Inkluder konkrete eksempler og tall der mulig

ÅRSTALL:
- Vi er i 2026. Bruk "2026" for aktuelle ting, "2025" for fjoråret.

HTML FORMAT:
- Start med <p> ingress (IKKE H1 - Ghost legger til tittel)
- Bruk <h2> for hovedseksjoner, <h3> for underseksjoner
- Bruk <ul>/<ol> for lister, <strong> for emphasis
- Bruk <a href="${config.siteUrl}"> for lenker

RETURNER ARTIKKELEN SOM JSON:
{
  "title": "SEO-optimalisert tittel (maks 60 tegn, søkeord først)",
  "metaTitle": "Tittel for Google SERP (maks 60 tegn)",
  "metaDescription": "Handlingsorientert meta (maks 155 tegn, inkluder søkeord + CTA)",
  "excerpt": "2-3 setninger for forhåndsvisning",
  "html": "<p>Full artikkel i HTML...</p>"
}`;

// Category-specific prompt additions
export const categoryPrompts = {
  trending: `
KATEGORI: Trending / Nyheter
Skriv en aktuell artikkel basert på nyheten/trenden.
- Hook: Start med HVORFOR dette er relevant for leseren NÅ
- Koble nyheten til kvitteringer, garanti eller dokumentasjon
- Gi 3-5 praktiske tips leseren kan handle på
- Vis hvordan ${config.siteUrl} hjelper i denne situasjonen
- SEO: Target "[trend] + kvittering/garanti/dokumentasjon" som long-tail`,

  'seo-gap': `
KATEGORI: SEO Gap / Søkeord-mulighet
Dette søkeordet har MANGE visninger men FÅ klikk. Du skal skrive den DEFINITIVE artikkelen.
- Svar på søkeintensjon i FØRSTE avsnitt (featured snippet-optimalisert)
- Dekk ALLE relaterte spørsmål en bruker kan ha
- Inkluder steg-for-steg instruksjoner der relevant
- Bruk søkeordet i H2, og long-tail varianter i H3
- Vis hvordan ${config.siteUrl} løser problemet
- SEO: Skriv for posisjon #1 - vær mer komplett og nyttig enn konkurrentene`,

  'store-guide': `
KATEGORI: Butikkguide
Skriv den KOMPLETTE guiden for denne butikken.
- H2: "Slik finner du kvitteringer fra [butikk]" (steg-for-steg)
- H2: "Problemer med [butikk]s system" (begrenset historikk, krever innlogging, etc.)
- H2: "Retur og reklamasjon hos [butikk]" (frister, krav, tips)
- H2: "Bedre løsning: Samle alt på ${config.siteUrl}" (sammenligning)
- SEO: Target "[butikk] kvittering", "[butikk] min side", "[butikk] garanti"`,

  business: `
KATEGORI: Bedrift / Enkeltpersonforetak
Skriv for næringsdrivende og selvstendig næringsdrivende.
- Forklar dokumentasjonskrav og regler (vis ekspertise)
- Inkluder konkrete beløpsgrenser, frister, MVA-satser
- Gi praktiske tips for regnskapsføring
- Vis hvordan ${config.siteUrl} sparer tid og sikrer compliance
- SEO: Target "[emne] enkeltpersonforetak", "[emne] selvstendig næringsdrivende"`,

  'problem-solving': `
KATEGORI: Problemløsning
Skriv for noen som HAR et problem akkurat nå.
- Åpning: Beskriv problemet (leseren skal tenke "ja, det er meg!")
- Umiddelbar løsning: Hva kan de gjøre NÅ
- Langsiktig løsning: Hvordan forebygge med ${config.siteUrl}
- FAQ: "Hva hvis...?" scenarioer
- SEO: Target "[problem] løsning", "hva gjør jeg når [problem]"`,

  'life-situation': `
KATEGORI: Livssituasjon
Skriv for en spesifikk livssituasjon der kvitteringer er viktige.
- Start med en relaterbar scenario/historie
- Forklar HVORFOR kvitteringer er kritiske i denne situasjonen
- Gi en sjekkliste: hvilke kvitteringer trenger du?
- Vis hvordan ${config.siteUrl} gjør hverdagen enklere
- SEO: Target "[situasjon] kvittering", "[situasjon] dokumentasjon"`,

  'feature-highlight': `
KATEGORI: Funksjonshøydepunkt
Skriv en artikkel som viser frem en funksjon i ${config.siteName}.
- Åpning: Problemet funksjonen løser (relaterbart)
- Demo: Slik fungerer det (steg-for-steg med detaljer)
- Sammenligning: Før vs. etter ${config.siteName}
- CTA: Prøv det selv på ${config.siteUrl}
- SEO: Target "[funksjon] app", "beste [funksjon] løsning"`,

  seasonal: `
KATEGORI: Sesongbasert innhold
Skriv en artikkel tilpasset årstiden/hendelsen.
- Knytt innholdet til aktuelle sesongbehov
- Gi tidssensitive tips ("gjør dette FØR [hendelse]")
- Inkluder sjekkliste for sesongen
- Vis hvordan ${config.siteUrl} hjelper akkurat nå
- SEO: Target "[sesong/hendelse] 2026 [kvittering-relatert]"`,

  'data-driven': `
KATEGORI: Datadrevet innhold
Denne artikkelen er basert på hva som ALLEREDE driver trafikk.
- Skriv i samme stil som topp-artiklene (praktisk, handlingsorientert)
- Fokuser på søkeordene med høye visninger
- Inkluder relaterte søkeord naturlig
- Demonstrer ${config.siteName} aktivt i bruk
- SEO: Match søkeintensjon NØYAKTIG - dette søkeordet har bevist etterspørsel`,

  'ai-creative': `
KATEGORI: AI-Kreativt innhold
Full kreativ frihet! Skriv noe UNIKT og engasjerende.
- Overraskende vinkler, uventede koblinger til kvitteringer
- Storytelling, analogier, "det du ikke visste om..."
- Myter og misforståelser om garanti/reklamasjon
- Psykologi, statistikk, fremtidstrender
- MÅ fortsatt være SEO-vennlig med god struktur og lenker til ${config.siteUrl}`
};

// Build the complete prompt for an article
export function buildPrompt(category, topicInfo) {
  let prompt = basePrompt;

  // Add category-specific instructions
  if (categoryPrompts[category]) {
    prompt += '\n\n' + categoryPrompts[category];
  }

  // Add the specific topic
  prompt += '\n\n---\n\nSKRIV ARTIKKEL:\n';

  if (topicInfo.topic) {
    prompt += `Emne: ${topicInfo.topic}\n`;
  }
  if (topicInfo.query) {
    prompt += `PRIMÆRT SØKEORD (MÅ være i tittel og H2): ${topicInfo.query}\n`;
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
    prompt += `SEO-kontekst: ${topicInfo.rationale}\n`;
  }
  if (topicInfo.keywords && topicInfo.keywords.length > 0) {
    prompt += `SEKUNDÆRE SØKEORD (inkluder naturlig): ${topicInfo.keywords.join(', ')}\n`;
  }
  if (topicInfo.analysisContext) {
    const ctx = topicInfo.analysisContext;
    prompt += `\nDATADREVET KONTEKST:\n`;
    if (ctx.basedOn) prompt += `Basert på: ${ctx.basedOn}\n`;
    if (ctx.targetQueries?.length > 0) prompt += `Target queries: ${ctx.targetQueries.join(', ')}\n`;
    if (ctx.contentAngle) prompt += `Vinkel: ${ctx.contentAngle}\n`;
    if (ctx.rationale) prompt += `Begrunnelse: ${ctx.rationale}\n`;
  }

  prompt += '\nSkriv artikkelen nå. KUN JSON-output.';

  return prompt;
}

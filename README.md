# Blog Generator for minekvitteringer.no

AI-drevet bloggenerator som automatisk lager SEO-optimaliserte artikler for minekvitteringer.no og poster til Ghost CMS.

## Funksjoner

- **AI-generert innhold** - Bruker OpenAI GPT-5.2 via Vercel AI SDK
- **SEO-optimalisert** - Strukturert med H2/H3, meta-beskrivelser, og naturlige lenker til minekvitteringer.no
- **Smart rotasjon** - Roterer mellom 9 innholdskategorier for variasjon
- **Flere datakilder** - RSS-feeds, Google Trends, og Search Console-data
- **Ghost CMS integrasjon** - Poster direkte som draft eller publisert
- **Batch API** - 50% rabatt på OpenAI for 10+ artikler
- **Duplikatdeteksjon** - Unngår å gjenta tidligere innhold
- **AI Creative** - 20% av innholdet er AI sine egne kreative ideer

## Hurtigreferanse

```bash
# Vanlig bruk: Generer 5 artikler som drafts
node index.js smart-generate

# Masseproduksjon: 15 artikler (bruker Batch API automatisk)
node index.js smart-generate -c 15 --autopost
# → Vent 10-60 min, sjekk status:
node index.js batch-status
# → Når ferdig:
node index.js batch-process <batchId> --autopost

# Bare se hva som vil genereres (uten å generere)
node index.js research
```

## Installasjon

```bash
npm install
```

## Konfigurasjon

Opprett en `.env` fil med:

```env
OPENAI_API_KEY=din-openai-api-key
API_URL=https://ghost.mkapi.no
ADMIN_API_KEY=din-ghost-admin-api-key
```

Ghost Admin API key finner du i Ghost Admin > Settings > Integrations > Add custom integration.

## Kommandoer

### Generer artikler

```bash
# Generer 1 artikkel (standard)
node index.js generate

# Generer 10 artikler som drafts
node index.js generate -c 10
node index.js generate --count 10

# Generer og publiser direkte (uten godkjenning)
node index.js generate -c 10 -a
node index.js generate --count 10 --autopost

# Dry run - generer uten å poste til Ghost
node index.js generate -c 5 -d
node index.js generate --count 5 --dryrun
```

### Smart Generate (Research + Artikler i ett)

```bash
# Kjør research og generer 5 artikler basert på funn (anbefalt!)
node index.js smart-generate

# Generer 10 data-drevne artikler
node index.js smart-generate -c 10

# Smart generate med auto-publisering
node index.js smart-generate -c 5 --autopost

# Force real-time generering (skip batch selv for 10+)
node index.js smart-generate -c 15 --no-batch
```

**Merk:** For 10+ artikler brukes automatisk OpenAI Batch API (50% rabatt). Se "Batch API" seksjonen under.

### Research Agent (AI-drevet research med ekte data)

Research-agenten bruker:
- **Google Trends API** - Finner trending searches i Norge
- **Search Console data** - Analyserer dine faktiske søkeord og muligheter
- **Daglige trender** - Hva folk søker etter akkurat nå

```bash
# Kjør generell research - henter og analyserer ekte data
node index.js research

# Research spesifikk kategori
node index.js research --focus phones
node index.js research --focus tvs
node index.js research --focus laptops
node index.js research --focus appliances
node index.js research --focus gaming
node index.js research --focus wearables
node index.js research --focus audio
node index.js research --focus homeAndGarden

# Research med custom fokus
node index.js research --focus "Black Friday tilbud"

# Vis agent-hjernens hukommelse og raw data
node index.js brain

# Generer smarte topic-forslag basert på lagret research
node index.js suggest
node index.js suggest -c 10
```

### Batch API (for 10+ artikler)

OpenAI Batch API gir **50% rabatt** på API-kostnader, men er asynkron. Perfekt for masseproduksjon av innhold.

**Hvordan det fungerer:**

1. **Submit batch** - Når du kjører `smart-generate` med 10+ artikler, sendes en batch-jobb til OpenAI
2. **Vent** - OpenAI prosesserer i bakgrunnen (vanligvis 10-60 min, maks 24 timer)
3. **Sjekk status** - Se om jobben er ferdig
4. **Hent resultater** - Last ned og post til Ghost

```bash
# Steg 1: Start batch (skjer automatisk ved 10+ artikler)
node index.js smart-generate -c 15 --autopost
# Output: "Batch created: batch_abc123..."

# Steg 2: Sjekk status (gjør dette senere)
node index.js batch-status batch_abc123

# Steg 3: Når status er "completed", hent og post resultater
node index.js batch-process batch_abc123 --autopost
```

**Batch-kommandoer:**

```bash
# List alle batch-jobber
node index.js batch-list

# Sjekk status på en spesifikk batch
node index.js batch-status <batchId>

# Prosesser ferdig batch og post til Ghost
node index.js batch-process <batchId>           # Som drafts
node index.js batch-process <batchId> --autopost # Publiser direkte

# Avbryt en kjørende batch
node index.js batch-cancel <batchId>
```

**Viktig:** Programmet kjører ikke 24/7. Du må manuelt kjøre `batch-process` når batchen er ferdig.

### Andre kommandoer

```bash
# Forhåndsvis neste topics som vil bli generert
node index.js preview
node index.js preview -c 10

# Vis statistikk over generert innhold
node index.js stats

# Test Ghost-tilkobling
node index.js test-connection
```

## Innholdskategorier

Generatoren roterer gjennom 9 kategorier:

| # | Kategori | Beskrivelse |
|---|----------|-------------|
| 1 | **Trending** | Nyheter fra norske RSS-feeds (Tek.no, E24, NRK, VG, etc.) |
| 2 | **SEO Gap** | Søkeord med høye visninger men få klikk fra Search Console |
| 3 | **Store Guide** | Guider for spesifikke butikker (Elkjøp, Power, Clas Ohlson, etc.) |
| 4 | **Business/ENK** | Innhold for bedrifter og enkeltpersonforetak |
| 5 | **Problem Solving** | Løsninger på vanlige kvitteringsproblemer |
| 6 | **Life Situation** | Kvitteringer i ulike livssituasjoner |
| 7 | **Feature Highlight** | Funksjoner i minekvitteringer.no |
| 8 | **Seasonal** | Sesongbasert innhold (Black Friday, skattemelding, etc.) |
| 9 | **AI Creative** | AI har full kreativ frihet (ca. 20% av innholdet) |

### AI Creative (20%)

Ca. 20% av generert innhold er "AI Creative" - her har AI-en full frihet til å foreslå originale vinkler:
- Uventede situasjoner der kvitteringer trengs
- Psykologien bak dokumentasjon
- Sammenligning med andre land
- Tips ingen andre skriver om
- Kreative storytelling-vinkler

## Research Agent

Research-agenten har en "hjerne" som husker hva den har researched:

- **Trending produkter** - Holder styr på populære produkter
- **Nyheter** - Lagrer relevante nyheter for artikkelideer
- **Kategori-innsikt** - Husker research per produktkategori
- **Sesong-muligheter** - Identifiserer tidssensitive trender

Agenten lærer over tid og gir bedre forslag jo mer du bruker den.

### Datakilder

| Kilde | Beskrivelse | Caching |
|-------|-------------|---------|
| **Google Trends RSS** | Trending søk i Norge (`trends.google.com/trending/rss?geo=NO`) | Daglig |
| **Google Trends API** | Relaterte søkeord og interesse over tid | Per forespørsel |
| **Search Console** | Dine faktiske søkeord, klikk og posisjoner | Manuell CSV-eksport |
| **RSS Feeds** | Norske nyheter (Tek.no, E24, Digi.no, NRK, VG) | Per forespørsel |

**Merk:** Google Trends data caches for hele dagen. Første `smart-generate` av dagen henter ferske data, påfølgende kjøringer bruker cached data.

### Duplikatdeteksjon

Systemet unngår å generere samme innhold flere ganger:

1. **Sjekker mot historikk** - Alle genererte artikler lagres i `data/generated-topics.json`
2. **Fuzzy matching** - Finner lignende titler og søkeord (60%+ keyword-match)
3. **Regenerering** - Hvis ideer filtreres som duplikater, prøver AI å finne nye
4. **Maks 5 runder** - Gir opp etter 5 forsøk på å finne unike ideer

Hvis du ber om 9 artikler men systemet bare finner 3 unike, genereres kun de 3.

### Research-kategorier

| Kategori | Beskrivelse |
|----------|-------------|
| phones | Mobiltelefoner, iPhone, Samsung, etc. |
| tvs | TV-er, OLED, QLED, Smart-TV |
| laptops | Laptops, MacBook, gaming-laptops |
| appliances | Hvitevarer, vaskemaskiner, kjøleskap |
| gaming | Konsoller, gaming-PC, tilbehør |
| wearables | Smartklokker, fitness-trackere |
| audio | Hodetelefoner, høyttalere, soundbars |
| homeAndGarden | Møbler, verktøy, hagemaskiner |

## Filstruktur

```
blog-generator/
├── index.js              # CLI entry point
├── config.js             # Konfigurasjon og innstillinger
├── ghost-client.js       # Ghost Admin API integrasjon
├── article-writer.js     # AI SDK + OpenAI artikkelgenerering
├── batch-writer.js       # OpenAI Batch API for 10+ artikler
├── prompts.js            # SEO-skriveprompts per kategori
├── content-types.js      # Innholdskategorier og topics
├── category-rotator.js   # Smart rotasjon mellom kategorier
├── topic-scorer.js       # Topic-valg logikk
├── rss-fetcher.js        # Norske nyhets-RSS feeds
├── seo-gaps.js           # Search Console CSV-parsing
├── trends-fetcher.js     # Google Trends integrasjon
├── generated-topics.js   # Sporing av generert innhold
├── research-agent.js     # AI research agent med hukommelse
├── searchconsole/        # Google Search Console CSV-data
└── data/
    ├── generated-topics.json   # Historikk over genererte artikler
    ├── rotation-state.json     # Rotasjonstilstand
    ├── agent-brain.json        # Research agent hukommelse (inkl. cached trends)
    └── batches/                # Batch-filer og resultater
```

## Search Console Data

Legg CSV-eksporter fra Google Search Console i `searchconsole/` mappen:

- `Forspørsler.csv` - Søkeord og klikk
- `Sider.csv` - Sideytelse
- `Tabell.csv` - Generell data

Generatoren bruker disse til å finne SEO-muligheter (høye visninger, lave klikk).

## Eksempler

### Generer 10 artikler for testing

```bash
node index.js generate -c 10 -d
```

### Generer 5 artikler som drafts

```bash
node index.js generate -c 5
```

Gå deretter til Ghost Admin for å gjennomgå og publisere.

### Massepublisering

```bash
node index.js generate -c 20 --autopost
```

**OBS:** Bruk med forsiktighet - artikler publiseres direkte uten gjennomgang.

## Ghost CMS

Alle artikler postes med:
- **Tag:** "Artikler"
- **Status:** Draft (standard) eller Published (med --autopost)
- **Meta title og description:** Automatisk generert for SEO

## Tips

1. **Start med drafts** - Generer som drafts først, gjennomgå kvaliteten
2. **Varier innholdet** - La rotasjonen gjøre jobben for variasjon
3. **Oppdater Search Console data** - Last ned nye CSV-filer regelmessig
4. **Test først** - Bruk `--dryrun` for å se hva som genereres

## Feilsøking

### "Could not connect to Ghost"
- Sjekk at `API_URL` og `ADMIN_API_KEY` er korrekte i `.env`
- Verifiser at Ghost-serveren kjører

### "Article generation failed"
- Sjekk at `OPENAI_API_KEY` er gyldig
- Verifiser at du har tilgang til GPT-5.2 modellen

### RSS feeds returnerer 404
- Noen feeds kan være midlertidig nede
- Generatoren fortsetter med andre kilder

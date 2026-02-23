import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { config } from './config.js';
import { getAllPostsWithContent } from './ghost-client.js';
import { loadSearchConsoleData } from './seo-gaps.js';

export class SiteAnalyzer {
  constructor() {
    this.posts = [];
    this.searchData = null;
    this.crossReferenced = [];
    this.topPerformers = [];
    this.doubleDownOpportunities = [];
    this.keywordClusters = [];
  }

  async analyze() {
    console.log('\n  Loading data...');
    this.posts = await getAllPostsWithContent();
    this.searchData = await loadSearchConsoleData();

    if (this.posts.length === 0) {
      console.log('  No posts found in Ghost. Cannot analyze.');
      return this;
    }

    if (!this.searchData?.pages?.length) {
      console.log('  No Search Console page data found. Cannot cross-reference.');
      return this;
    }

    console.log('\n  Cross-referencing posts with Search Console data...');
    this.crossReferencePostsAndPages();

    console.log('  Identifying top performers...');
    this.identifyTopPerformers();

    console.log('  Finding double-down opportunities...');
    this.identifyDoubleDownOpportunities();

    console.log('  Clustering keywords...');
    this.identifyKeywordClusters();

    return this;
  }

  crossReferencePostsAndPages() {
    this.crossReferenced = this.posts.map(post => {
      // Match by URL - Search Console pages contain the full URL
      const blogUrl = `${config.siteUrl}/blog/${post.slug}`;
      const pageData = this.searchData.pages.find(p =>
        p.page?.toLowerCase() === blogUrl.toLowerCase() ||
        p.page?.toLowerCase() === (blogUrl + '/').toLowerCase()
      );

      return {
        title: post.title,
        slug: post.slug,
        url: blogUrl,
        publishedAt: post.published_at,
        theme: this.extractTheme(post.slug, post.title),
        plaintext: post.plaintext?.substring(0, 500) || '',
        clicks: pageData?.clicks || 0,
        impressions: pageData?.impressions || 0,
        ctr: pageData?.ctr || 0,
        position: pageData?.position || 0,
        hasSearchData: !!pageData
      };
    });

    const matched = this.crossReferenced.filter(p => p.hasSearchData).length;
    console.log(`  Matched ${matched}/${this.posts.length} posts to Search Console data`);
  }

  identifyTopPerformers() {
    this.topPerformers = this.crossReferenced
      .filter(p => p.hasSearchData)
      .map(p => ({
        ...p,
        score: p.clicks * 2 + p.impressions * 0.01 + p.ctr * 10
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);
  }

  identifyDoubleDownOpportunities() {
    // Group all cross-referenced posts by theme
    const themeGroups = {};
    for (const post of this.crossReferenced) {
      const theme = post.theme;
      if (!themeGroups[theme]) {
        themeGroups[theme] = { posts: [], totalClicks: 0, totalImpressions: 0, avgCtr: 0 };
      }
      themeGroups[theme].posts.push(post);
      themeGroups[theme].totalClicks += post.clicks;
      themeGroups[theme].totalImpressions += post.impressions;
    }

    // Calculate averages and score themes
    this.doubleDownOpportunities = Object.entries(themeGroups)
      .map(([theme, data]) => {
        const postsWithData = data.posts.filter(p => p.hasSearchData);
        const avgCtr = postsWithData.length > 0
          ? postsWithData.reduce((sum, p) => sum + p.ctr, 0) / postsWithData.length
          : 0;

        // Score: high impressions + some clicks = proven interest, room for more content
        const growthScore = data.totalImpressions * 0.1 + data.totalClicks * 2 + avgCtr * 5;

        return {
          theme,
          postCount: data.posts.length,
          totalClicks: data.totalClicks,
          totalImpressions: data.totalImpressions,
          avgCtr: Math.round(avgCtr * 100) / 100,
          growthScore: Math.round(growthScore),
          topPost: data.posts.sort((a, b) => b.clicks - a.clicks)[0]?.title || 'N/A'
        };
      })
      .filter(t => t.totalImpressions > 0)
      .sort((a, b) => b.growthScore - a.growthScore);
  }

  identifyKeywordClusters() {
    if (!this.searchData?.queries?.length) return;

    // Define keyword cluster patterns relevant to the site
    const clusterPatterns = [
      { name: 'elkjop', patterns: ['elkjøp', 'elkjop', 'elko'] },
      { name: 'clas-ohlson', patterns: ['clas ohlson', 'clasohlson', 'clas-ohlson'] },
      { name: 'power', patterns: ['power'] },
      { name: 'komplett', patterns: ['komplett'] },
      { name: 'xxl', patterns: ['xxl'] },
      { name: 'ikea', patterns: ['ikea'] },
      { name: 'garanti', patterns: ['garanti', 'warranty', 'reklamasjon'] },
      { name: 'kvittering', patterns: ['kvittering', 'receipt', 'bon'] },
      { name: 'retur', patterns: ['retur', 'bytte', 'returnere'] },
      { name: 'bedrift', patterns: ['bedrift', 'firma', 'enk', 'enkeltperson', 'næringsdrivende', 'mva'] },
      { name: 'forsikring', patterns: ['forsikring', 'insurance'] },
      { name: 'skatt', patterns: ['skatt', 'fradrag', 'selvangivelse'] },
      { name: 'netthandel', patterns: ['netthandel', 'nettbutikk', 'online'] },
      { name: 'telefon', patterns: ['telefon', 'iphone', 'samsung', 'mobil'] },
    ];

    this.keywordClusters = clusterPatterns.map(cluster => {
      const matchingQueries = this.searchData.queries.filter(q =>
        cluster.patterns.some(p => q.query?.toLowerCase().includes(p))
      );

      // Find which queries already have content (matched to a post)
      const covered = matchingQueries.filter(q => {
        return this.crossReferenced.some(post =>
          post.hasSearchData &&
          (post.title?.toLowerCase().includes(q.query?.toLowerCase()) ||
           post.slug?.includes(q.query?.toLowerCase().replace(/\s+/g, '-')))
        );
      });

      const uncovered = matchingQueries.filter(q => !covered.includes(q));

      return {
        name: cluster.name,
        totalQueries: matchingQueries.length,
        totalImpressions: matchingQueries.reduce((sum, q) => sum + q.impressions, 0),
        totalClicks: matchingQueries.reduce((sum, q) => sum + q.clicks, 0),
        coveredCount: covered.length,
        uncoveredCount: uncovered.length,
        topUncovered: uncovered
          .sort((a, b) => b.impressions - a.impressions)
          .slice(0, 5)
          .map(q => ({ query: q.query, impressions: q.impressions, clicks: q.clicks }))
      };
    })
    .filter(c => c.totalQueries > 0)
    .sort((a, b) => b.totalImpressions - a.totalImpressions);
  }

  extractTheme(slug, title) {
    const text = `${slug} ${title}`.toLowerCase();

    const themeMap = [
      { theme: 'store-receipt-guide', keywords: ['kvittering', 'receipt', 'bon', 'kjøpsbevis'] },
      { theme: 'warranty-guide', keywords: ['garanti', 'reklamasjon', 'warranty', 'retur', 'bytte'] },
      { theme: 'tax-business', keywords: ['skatt', 'mva', 'fradrag', 'enk', 'bedrift', 'firma', 'regnskap', 'næring'] },
      { theme: 'insurance', keywords: ['forsikring', 'insurance', 'innbo', 'skade'] },
      { theme: 'store-guide-elkjop', keywords: ['elkjøp', 'elkjop'] },
      { theme: 'store-guide-power', keywords: ['power'] },
      { theme: 'store-guide-clas-ohlson', keywords: ['clas ohlson', 'clas-ohlson'] },
      { theme: 'store-guide-komplett', keywords: ['komplett'] },
      { theme: 'store-guide-xxl', keywords: ['xxl'] },
      { theme: 'store-guide-ikea', keywords: ['ikea'] },
      { theme: 'digital-storage', keywords: ['digital', 'lagring', 'app', 'skanning', 'ocr'] },
      { theme: 'consumer-rights', keywords: ['forbruker', 'rettighet', 'klage', 'forbrukertilsynet'] },
      { theme: 'netthandel', keywords: ['netthandel', 'nettbutikk', 'online', 'ehandel'] },
      { theme: 'electronics', keywords: ['telefon', 'iphone', 'samsung', 'tv', 'pc', 'laptop', 'elektronikk'] },
    ];

    for (const { theme, keywords } of themeMap) {
      if (keywords.some(kw => text.includes(kw))) {
        return theme;
      }
    }

    return 'general';
  }

  buildContentBrief() {
    const top10 = this.topPerformers.slice(0, 10);
    const topThemes = this.doubleDownOpportunities.slice(0, 5);
    const topClusters = this.keywordClusters.slice(0, 5);

    return {
      siteUrl: config.siteUrl,
      siteName: config.siteName,
      totalPosts: this.posts.length,
      postsWithSearchData: this.crossReferenced.filter(p => p.hasSearchData).length,
      topPerformers: top10.map(p => ({
        title: p.title,
        slug: p.slug,
        clicks: p.clicks,
        impressions: p.impressions,
        ctr: p.ctr,
        theme: p.theme,
        snippet: p.plaintext?.substring(0, 200)
      })),
      topThemes: topThemes.map(t => ({
        theme: t.theme,
        postCount: t.postCount,
        totalClicks: t.totalClicks,
        totalImpressions: t.totalImpressions,
        avgCtr: t.avgCtr,
        growthScore: t.growthScore
      })),
      keywordOpportunities: topClusters.flatMap(c =>
        c.topUncovered.map(q => ({
          cluster: c.name,
          query: q.query,
          impressions: q.impressions,
          clicks: q.clicks
        }))
      ).slice(0, 15),
      highImpressionQueries: this.searchData?.queries
        ?.filter(q => q.impressions > 50)
        .sort((a, b) => b.impressions - a.impressions)
        .slice(0, 20)
        .map(q => ({ query: q.query, impressions: q.impressions, clicks: q.clicks, ctr: q.ctr })) || []
    };
  }

  async generateTopicSuggestions(count = 5) {
    const brief = this.buildContentBrief();

    const prompt = `Du er en SEO-strateg for ${config.siteName} (${config.siteUrl}), en norsk digital kvitteringslagringstjeneste.

Basert på analyse av bloggens ytelse, foreslå ${count} nye artikler som "dobler ned" på det som allerede fungerer.

ANALYSE-DATA:
- Totalt ${brief.totalPosts} publiserte innlegg, ${brief.postsWithSearchData} har Search Console-data

TOP 10 BESTE INNLEGG (etter klikk/visninger):
${brief.topPerformers.map((p, i) => `${i + 1}. "${p.title}" - ${p.clicks} klikk, ${p.impressions} visninger, CTR: ${p.ctr}%, tema: ${p.theme}`).join('\n')}

BESTE TEMAER (etter vekstpotensial):
${brief.topThemes.map(t => `- ${t.theme}: ${t.postCount} innlegg, ${t.totalClicks} klikk, ${t.totalImpressions} visninger`).join('\n')}

UBRUKTE SØKEORD MED HØY TRAFIKK:
${brief.keywordOpportunities.map(q => `- "${q.query}" (${q.cluster}): ${q.impressions} visninger, ${q.clicks} klikk`).join('\n')}

SØKEORD MED FLEST VISNINGER:
${brief.highImpressionQueries.map(q => `- "${q.query}": ${q.impressions} visninger, ${q.clicks} klikk, CTR: ${q.ctr}%`).join('\n')}

OPPGAVE:
Foreslå ${count} nye artikler som:
1. Bygger videre på temaer som allerede driver trafikk
2. Dekker søkeord med høye visninger men lav CTR
3. Fyller hull i eksisterende innholdsstrategi
4. Demonstrerer produktet ${config.siteName} i bruk

For HVER artikkel, returner JSON:
{
  "suggestions": [
    {
      "title": "Artikkelens tittel",
      "primaryKeyword": "hovedsøkeord",
      "category": "data-driven",
      "priority": "high/medium/low",
      "basedOn": "Hvilken top-performer eller tema dette bygger på",
      "targetQueries": ["søkeord1", "søkeord2"],
      "contentAngle": "Kort beskrivelse av vinklingen",
      "topPerformerExample": "Tittel på best-performer som inspirerte dette",
      "rationale": "Hvorfor denne artikkelen vil fungere basert på dataene"
    }
  ]
}

Returner KUN JSON, ingen annen tekst.`;

    try {
      const { text } = await generateText({
        model: openai(config.openaiModel),
        prompt,
        maxTokens: 3000,
      });

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('  Could not parse topic suggestions from AI response');
        return [];
      }

      const result = JSON.parse(jsonMatch[0]);
      return result.suggestions || [];
    } catch (error) {
      console.error('  Failed to generate topic suggestions:', error.message);
      return [];
    }
  }

  printReport() {
    console.log('\n' + '='.repeat(60));
    console.log('  SITE PERFORMANCE ANALYSIS');
    console.log('='.repeat(60));

    // Top performers
    console.log('\n  TOP 10 PERFORMING POSTS:');
    console.log('-'.repeat(50));
    this.topPerformers.slice(0, 10).forEach((p, i) => {
      console.log(`  ${i + 1}. "${p.title}"`);
      console.log(`     Clicks: ${p.clicks} | Impressions: ${p.impressions} | CTR: ${p.ctr}% | Theme: ${p.theme}`);
    });

    // Double-down opportunities
    console.log('\n  DOUBLE-DOWN OPPORTUNITIES (themes ranked by growth potential):');
    console.log('-'.repeat(50));
    this.doubleDownOpportunities.slice(0, 10).forEach((t, i) => {
      console.log(`  ${i + 1}. ${t.theme}`);
      console.log(`     Posts: ${t.postCount} | Clicks: ${t.totalClicks} | Impressions: ${t.totalImpressions} | Avg CTR: ${t.avgCtr}% | Score: ${t.growthScore}`);
      console.log(`     Top post: "${t.topPost}"`);
    });

    // Keyword clusters
    console.log('\n  KEYWORD CLUSTERS:');
    console.log('-'.repeat(50));
    this.keywordClusters.forEach(c => {
      console.log(`  ${c.name}: ${c.totalQueries} queries, ${c.totalImpressions} impressions, ${c.coveredCount} covered / ${c.uncoveredCount} uncovered`);
      if (c.topUncovered.length > 0) {
        console.log(`     Uncovered:`);
        c.topUncovered.forEach(q => {
          console.log(`       - "${q.query}" (${q.impressions} impressions)`);
        });
      }
    });

    console.log('\n' + '='.repeat(60) + '\n');
  }
}

const fs = require('fs');
const puppeteer = require('puppeteer');

const PAGES = [
  { squad: 'Melksham Town 1st', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-men-1st-team/' },
  { squad: 'Melksham Town Res', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-res/' },
  { squad: 'FOF FC', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/fof-mens-1st-xi/' },
  { squad: 'Melksham Ladies', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-ladies/' },
  { squad: 'Melksham Vets', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-vets/' },
  { squad: 'RFC Women', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-women-fixtures-2026-2027/' },
  { squad: 'RFC Men 1st XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-mens-1xv-fixtures-2026-2027/' },
  { squad: 'RFC Men 2nd XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-2xv-fixtures-2026-2027/' },
  { squad: 'U18s Academy', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-u18s-academy/' },
  { squad: 'Fawns U16', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u16/' },
  { squad: 'RFC 16s Bucks', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-16s-the-bucks/' },
  { squad: 'Fawns U14', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u14/' }
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const allFixtures = [];

  for (const pageInfo of PAGES) {
    try {
      console.log(`Scraping: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });

      const matchData = await page.evaluate((info) => {
        let teamsText = '';
        let metaText = '';

        // Clean out junk tags immediately
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        // 1. FIRST TRY TARGETING INDIVIDUAL MATCH CONTAINERS
        const cards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item');
        for (const card of cards) {
          const title = card.querySelector('.match-title, .fixture-teams, strong');
          const meta = card.querySelector('.match-location, .date-header, .fixture-meta');
          if (title && title.textContent.trim().length < 100) {
            teamsText = title.textContent.trim();
            if (meta) metaText = meta.textContent.trim();
            break;
          }
        }

        // 2. PARSE UNSTRUCTURED HTML DUMPS USING REGEX
        if (!teamsText) {
          const widgets = document.querySelectorAll('.elementor-widget-html');
          
          for (const widget of widgets) {
            const text = widget.textContent.replace(/\s+/g, ' ').trim();

            if (text.toLowerCase().includes(' vs ') || text.toLowerCase().includes(' v ')) {
              // Extract phrases surrounding 'vs' or 'v' (limit length to 80 chars)
              const matchRegex = /([A-Za-z0-9\s]+(?:VS|vs|v|V)[A-Za-z0-9\s]+)/g;
              const matches = text.match(matchRegex);

              if (matches && matches.length > 0) {
                // Find first valid match phrase excluding page titles
                for (let m of matches) {
                  m = m.trim();
                  if (m.length > 8 && m.length < 80 && !m.toLowerCase().includes('fixtures') && !m.toLowerCase().includes('results')) {
                    teamsText = m;
                    break;
                  }
                }
              }

              // Extract date pattern if present (e.g. 27 Sept 2026 or Saturday 26 Sept)
              const dateRegex = /((?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)?\s?\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sept|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i;
              const dateMatch = text.match(dateRegex);
              if (dateMatch) {
                metaText = dateMatch[0].trim();
              } else {
                metaText = 'Check team page for kickoff time';
              }

              if (teamsText) break;
            }
          }
        }

        // 3. CLEANUP & FALLBACK
        if (!teamsText || teamsText.length > 80) {
          teamsText = `${info.squad} Fixtures`;
          metaText = 'See full schedule on team page';
        }

        return {
          squad: info.squad,
          sport: info.sport,
          badgeClass: info.badgeClass,
          teams: teamsText,
          dateStr: metaText,
          url: info.url
        };
      }, pageInfo);

      if (matchData) {
        allFixtures.push(matchData);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Saved ${allFixtures.length} clean fixtures into fixtures.json`);
})();

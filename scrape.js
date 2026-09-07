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

      // Extract details from Elementor HTML widgets
      const widgetsData = await page.evaluate((info) => {
        const results = [];
        const widgets = document.querySelectorAll('.elementor-widget-html');

        widgets.forEach((widget) => {
          const text = widget.textContent.trim();
          if (text.toLowerCase().includes(' vs ') || text.toLowerCase().includes(' v ')) {
            
            // Extract team text and date meta if present
            const teamsEl = widget.querySelector('strong') || widget.querySelector('.fixture-teams');
            const metaEl = widget.querySelector('p') || widget.querySelector('span') || widget.querySelector('.fixture-meta');

            results.push({
              squad: info.squad,
              sport: info.sport,
              badgeClass: info.badgeClass,
              teams: teamsEl ? teamsEl.textContent.trim() : text,
              dateStr: metaEl ? metaEl.textContent.trim() : '',
              url: info.url,
              scrapedAt: new Date().toISOString()
            });
          }
        });

        return results;
      }, pageInfo);

      allFixtures.push(...widgetsData);
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  // Save compiled data to fixtures.json
  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Saved ${allFixtures.length} total fixtures to fixtures.json`);
})();

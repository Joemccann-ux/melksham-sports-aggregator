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

      const squadFixtures = await page.evaluate((info) => {
        const matches = [];

        // 1. Target specific match cards inside sub-pages first
        const matchCards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item');

        if (matchCards.length > 0) {
          matchCards.forEach((card) => {
            const titleEl = card.querySelector('.match-title, .fixture-teams, strong');
            const metaEl = card.querySelector('.match-location, .date-header, .fixture-meta');

            if (titleEl) {
              matches.push({
                squad: info.squad,
                sport: info.sport,
                badgeClass: info.badgeClass,
                teams: titleEl.textContent.trim(),
                dateStr: metaEl ? metaEl.textContent.trim() : '',
                url: info.url
              });
            }
          });
        } else {
          // 2. Fallback for custom Elementor HTML widgets
          const widgets = document.querySelectorAll('.elementor-widget-html');
          widgets.forEach((widget) => {
            const clone = widget.cloneNode(true);
            
            // Strictly delete all internal CSS or JS elements
            const garbage = clone.querySelectorAll('style, script, head, link');
            garbage.forEach(el => el.remove());

            const cleanText = clone.textContent.replace(/\s+/g, ' ').trim();

            if (cleanText.toLowerCase().includes(' vs ') || cleanText.toLowerCase().includes(' v ')) {
              const strongEl = clone.querySelector('strong');
              
              let teamsText = strongEl ? strongEl.textContent.trim() : '';
              if (!teamsText || teamsText.length > 80) {
                teamsText = `${info.squad} Match`;
              }

              matches.push({
                squad: info.squad,
                sport: info.sport,
                badgeClass: info.badgeClass,
                teams: teamsText,
                dateStr: 'Check team page for kickoff time',
                url: info.url
              });
            }
          });
        }

        return matches;
      }, pageInfo);

      // Take only the first match per squad
      if (squadFixtures.length > 0) {
        allFixtures.push(squadFixtures[0]);
      }
    } catch (err) {
      console.error(`Error on ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(allFixtures, null, 2));
  console.log(`Successfully compiled ${allFixtures.length} clean fixtures.`);
})();

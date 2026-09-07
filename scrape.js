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
        // 1. HARD REMOVE ANY DOM ELEMENTS CONTAINING "Fav Move:"
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
          if (el.children.length === 0 && el.textContent.includes('Fav Move:')) {
            el.remove();
          }
        });

        let teamsText = '';
        let metaText = '';

        // 2. CHECK SPECIFIC MATCH CONTAINERS
        const matchCards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item');
        for (const card of matchCards) {
          const title = card.querySelector('.match-title, .fixture-teams, strong, b');
          const meta = card.querySelector('.match-location, .date-header, .fixture-meta, p');

          if (title) {
            const rawTitle = title.textContent.trim();
            if (rawTitle && !rawTitle.toLowerCase().includes('fav move')) {
              teamsText = rawTitle;
              if (meta) metaText = meta.textContent.trim();
              break;
            }
          }
        }

        // 3. FALLBACK: SCAN ELEMENTOR HTML WIDGETS
        if (!teamsText) {
          const widgets = document.querySelectorAll('.elementor-widget-html');
          
          for (const widget of widgets) {
            const clone = widget.cloneNode(true);
            
            // Delete scripts, styles, and unwanted metadata elements
            const junk = clone.querySelectorAll('style, script, head, link');
            junk.forEach(el => el.remove());

            const cleanText = clone.textContent.replace(/\s+/g, ' ').trim();

            if ((cleanText.toLowerCase().includes(' vs ') || cleanText.toLowerCase().includes(' v ')) && !cleanText.toLowerCase().includes('fav move')) {
              // Extract strong tags or paragraphs containing 'vs'
              const bolds = clone.querySelectorAll('strong, b, p, h3, h4');
              for (const b of bolds) {
                const bText = b.textContent.trim();
                if ((bText.toLowerCase().includes(' vs ') || bText.toLowerCase().includes(' v ')) && !bText.toLowerCase().includes('fav move')) {
                  teamsText = bText;
                  break;
                }
              }

              if (!teamsText) {
                // Isolate sentence with vs
                const sentences = cleanText.split(/[\.\n]/);
                const vsSentence = sentences.find(s => (s.toLowerCase().includes(' vs ') || s.toLowerCase().includes(' v ')) && !s.toLowerCase().includes('fav move'));
                if (vsSentence) teamsText = vsSentence.trim();
              }

              metaText = 'Check team page for kickoff time';
              break;
            }
          }
        }

        // 4. GUARANTEED FALLBACK: USE CLEAN SQUAD NAME
        if (!teamsText || teamsText.toLowerCase().includes('fav move')) {
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

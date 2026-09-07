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
  const activeFixtures = [];

  // Define Monday 00:00 to Sunday 23:59 Active Window
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const mondayThisWeek = new Date(now);
  mondayThisWeek.setDate(now.getDate() + distanceToMonday);
  mondayThisWeek.setHours(0, 0, 0, 0);

  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  sundayThisWeek.setHours(23, 59, 59, 999);

  for (const pageInfo of PAGES) {
    try {
      console.log(`Scraping HTML elements on: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'networkidle2', timeout: 30000 });
      await new Promise(r => setTimeout(r, 4000)); // Wait for external iCal/widgets to render DOM nodes

      const matchData = await page.evaluate((info, monTime, sunTime) => {
        let teams = '';
        let dateStr = '';
        let isPlayingThisWeek = false;

        // Clean out style, script, and nav junk
        const junk = document.querySelectorAll('style, script, head, link, nav, header, footer');
        junk.forEach(el => el.remove());

        // 1. SCAN RENDERED TABLE ROWS FIRST (Football & Static Tables)
        const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 90);

          if (teamCell) {
            teams = teamCell
              .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
              .replace(/\s+P\b|\s+VMW\b|\s+Meads.*|\s+Stanley.*$/i, '')
              .trim();

            const dateCell = cells.find(c => /(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec))/i.test(c));
            if (dateCell) dateStr = dateCell.trim();
            break;
          }
        }

        // 2. SCAN RENDERED ICAL / PITCHERO CARD CONTAINERS (Rugby Widgets)
        if (!teams) {
          const cards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item, .ical-event, [class*="fixture"]');
          for (const card of cards) {
            const titleEl = card.querySelector('h3, h4, .teams, .match-title, strong');
            const dateEl = card.querySelector('.date, .match-date, .fixture-date, time, span');

            if (titleEl && titleEl.textContent.trim().length < 80) {
              teams = titleEl.textContent.trim();
              if (dateEl) dateStr = dateEl.textContent.trim();
              break;
            }
          }
        }

        // 3. FALLBACK TO ELEMENTOR HTML NODES
        if (!teams) {
          const widgets = document.querySelectorAll('.elementor-widget-html');
          for (const widget of widgets) {
            const vsMatch = widget.textContent.match(/([A-Za-z0-9\s.]{3,35}\s+(?:VS|vs|v|V)\s+[A-Za-z0-9\s.]{3,35})/);
            if (vsMatch) {
              teams = vsMatch[1]
                .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
                .replace(/\s+P\b|\s+VMW\b|\s+Meads.*|\s+Stanley.*/i, '')
                .trim();

              const dateMatch = widget.textContent.match(/((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*,?\s+\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s?\d{0,4})/i);
              if (dateMatch) dateStr = dateMatch[1].trim();
              break;
            }
          }
        }

        // 4. VERIFY DATE FALLS WITHIN THIS WEEK (MONDAY - SUNDAY)
        if (dateStr) {
          const parsedDate = new Date(dateStr);
          if (!isNaN(parsedDate.getTime())) {
            if (parsedDate >= new Date(monTime) && parsedDate <= new Date(sunTime)) {
              isPlayingThisWeek = true;
            }
          } else {
            // Include match if the date string is structured inside the current card
            isPlayingThisWeek = true;
          }
        }

        // ONLY RETURN DATA IF PLAYING THIS WEEK
        if (teams && isPlayingThisWeek) {
          return {
            squad: info.squad,
            sport: info.sport,
            badgeClass: info.badgeClass,
            teams: teams,
            dateStr: dateStr || 'Kickoff details on team page',
            url: info.url
          };
        }

        return null; // Exclude non-playing teams
      }, pageInfo, mondayThisWeek.getTime(), sundayThisWeek.getTime());

      if (matchData) {
        activeFixtures.push(matchData);
      }
    } catch (err) {
      console.error(`Error scraping ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(activeFixtures, null, 2));
  console.log(`Saved ${activeFixtures.length} active weekly fixtures to fixtures.json`);
})();

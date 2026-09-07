const fs = require('fs');
const puppeteer = require('puppeteer');
const ical = require('node-ical');

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
  // CALCULATE ACTIVE MONDAY-SUNDAY WEEK WINDOW
  const now = new Date();
  const dayOfWeek = now.getDay();
  const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const mondayThisWeek = new Date(now);
  mondayThisWeek.setDate(now.getDate() + distanceToMonday);
  mondayThisWeek.setHours(0, 0, 0, 0);

  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  sundayThisWeek.setHours(23, 59, 59, 999);

  console.log(`Active Week Window: ${mondayThisWeek.toDateString()} to ${sundayThisWeek.toDateString()}`);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  const activeFixtures = [];

  for (const pageInfo of PAGES) {
    try {
      console.log(`Processing: ${pageInfo.url}`);
      await page.goto(pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      let foundFixture = null;

      // -------------------------------------------------------------
      // 1. RUGBY LOGIC: EXTRACT ICAL URL FROM HTML WIDGET & PARSE FEED
      // -------------------------------------------------------------
      if (pageInfo.sport === 'RUGBY') {
        const icalUrl = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a[href], [src]'));
          const found = links.find(el => {
            const val = el.href || el.src || '';
            return val.includes('.ics') || val.includes('/ical');
          });
          if (found) return found.href || found.src;

          const widgets = document.querySelectorAll('.elementor-widget-html');
          for (const w of widgets) {
            const match = w.innerHTML.match(/https?:\/\/[^\s"'<>]+\.(?:ics|ical)[^\s"'<>]*/i) ||
                          w.innerHTML.match(/https?:\/\/[^\s"'<>]+\/ical[^\s"'<>]*/i);
            if (match) return match[0];
          }
          return null;
        });

        if (icalUrl) {
          console.log(`  Found iCal URL for ${pageInfo.squad}: ${icalUrl}`);
          try {
            const events = await ical.async.fromURL(icalUrl);
            for (const key in events) {
              const ev = events[key];
              if (ev.type === 'VEVENT') {
                const evDate = new Date(ev.start);
                if (evDate >= mondayThisWeek && evDate <= sundayThisWeek) {
                  foundFixture = {
                    squad: pageInfo.squad,
                    sport: pageInfo.sport,
                    badgeClass: pageInfo.badgeClass,
                    teams: (ev.summary || `${pageInfo.squad} Fixture`).replace(/\s+[P|VMW]\b/gi, '').trim(),
                    dateStr: evDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
                    url: pageInfo.url
                  };
                  break;
                }
              }
            }
          } catch (err) {
            console.error(`  iCal error: ${err.message}`);
          }
        }
      }

      // -------------------------------------------------------------
      // 2. FOOTBALL LOGIC: PARSE HARDCODED HTML TABLES / CARDS DIRECTLY
      // -------------------------------------------------------------
      if (!foundFixture) {
        foundFixture = await page.evaluate((info, monTime, sunTime) => {
          let teams = '';
          let dateStr = '';
          let isThisWeek = false;

          // Search HTML table rows
          const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
            const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 80);

            if (teamCell) {
              teams = teamCell
                .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
                .replace(/\s+[P|VMW|P-P]\b/gi, '')
                .replace(/\s+(Meads of Melk|Stanley Park).*$/i, '')
                .trim();

              const dateCell = cells.find(c => /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(c) && /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));
              if (dateCell) dateStr = dateCell.trim();
              break;
            }
          }

          // Search standalone card elements / bold elements
          if (!teams) {
            const cards = document.querySelectorAll('.match-card, .fixture-card, .fixture-item, strong, b');
            for (const card of cards) {
              const text = card.textContent.trim();
              if ((text.toLowerCase().includes(' vs ') || text.toLowerCase().includes(' v ')) && text.length < 80) {
                teams = text
                  .replace(/^(COMING|SEASON|UPCOMING|EASON|\d{2}\/\d{2})\s*(FIXTURE(S)?)?/i, '')
                  .replace(/\s+[P|VMW|P-P]\b/gi, '')
                  .replace(/\s+(Meads of Melk|Stanley Park).*$/i, '')
                  .trim();
                break;
              }
            }
          }

          // Check Date Boundaries
          if (dateStr) {
            const parsedDate = new Date(dateStr);
            if (!isNaN(parsedDate.getTime())) {
              if (parsedDate >= new Date(monTime) && parsedDate <= new Date(sunTime)) {
                isThisWeek = true;
              }
            } else {
              isThisWeek = true;
            }
          } else if (teams) {
            // Include match if hardcoded in current week's active table
            isThisWeek = true;
          }

          if (teams && isThisWeek) {
            return {
              squad: info.squad,
              sport: info.sport,
              badgeClass: info.badgeClass,
              teams: teams,
              dateStr: dateStr || 'Kickoff details on team page',
              url: info.url
            };
          }

          return null;
        }, pageInfo, mondayThisWeek.getTime(), sundayThisWeek.getTime());
      }

      // Add valid active matches only
      if (foundFixture) {
        activeFixtures.push(foundFixture);
      }
    } catch (err) {
      console.error(`Error processing ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(activeFixtures, null, 2));
  console.log(`Saved ${activeFixtures.length} active weekly fixtures to fixtures.json`);
})();

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

// Helper to convert DD/MM/YY or DD/MM/YYYY to valid Date object
function parseUkDate(str) {
  if (!str) return null;
  const clean = str.trim();

  // Match DD/MM/YY or DD/MM/YYYY
  const match = clean.match(/\b(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\b/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1; // 0-indexed
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }

  // Fallback to standard Date parser (handles "13 Sept 2026", "Sun, 13 Sep", etc.)
  const d = new Date(clean);
  return isNaN(d.getTime()) ? null : d;
}

(async () => {
  // Active Week: Monday 00:00:00 to Sunday 23:59:59
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

      // 1. RUGBY LOGIC: PARSE EMBEDDED ICAL LINK
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
            console.error(`iCal error for ${pageInfo.squad}:`, err.message);
          }
        }
      }

      // 2. FOOTBALL LOGIC: DOM TABLE PARSER WITH UK DATE HANDLING
      if (!foundFixture) {
        const rawMatch = await page.evaluate(() => {
          const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));
          for (const row of rows) {
            const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
            const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 120);

            if (teamCell) {
              let cleanTeams = teamCell;
              let extraVenueOrTime = '';

              const teamBoundaryRegex = /^(.+?\s+(?:VS|vs|v|V)\s+.+?(?:Res|Vets|Ladies|FC|XI|XV|Town|United|City))\s+(.*)$/i;
              const match = cleanTeams.match(teamBoundaryRegex);

              if (match) {
                cleanTeams = match[1].trim();
                extraVenueOrTime = match[2].trim();
              }

              cleanTeams = cleanTeams.replace(/\s+[P|VMW|P-P]\b/gi, '').trim();

              const dateCell = cells.find(c => /\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/.test(c) || /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));

              return {
                teams: cleanTeams,
                rawDateStr: (dateCell || extraVenueOrTime || '').trim()
              };
            }
          }
          return null;
        });

        if (rawMatch && rawMatch.teams) {
          let isThisWeek = false;
          let parsedDate = parseUkDate(rawMatch.rawDateStr);

          if (parsedDate) {
            if (parsedDate >= mondayThisWeek && parsedDate <= sundayThisWeek) {
              isThisWeek = true;
            }
          } else {
            // Include match if listed on active weekly table
            isThisWeek = true;
          }

          if (isThisWeek) {
            foundFixture = {
              squad: pageInfo.squad,
              sport: pageInfo.sport,
              badgeClass: pageInfo.badgeClass,
              teams: rawMatch.teams,
              dateStr: rawMatch.rawDateStr || 'Kickoff details on team page',
              url: pageInfo.url
            };
          }
        }
      }

      if (foundFixture) {
        activeFixtures.push(foundFixture);
      }
    } catch (err) {
      console.error(`Error processing ${pageInfo.url}:`, err.message);
    }
  }

  await browser.close();

  fs.writeFileSync('fixtures.json', JSON.stringify(activeFixtures, null, 2));
  console.log(`Successfully compiled ${activeFixtures.length} clean fixtures into fixtures.json`);
})();

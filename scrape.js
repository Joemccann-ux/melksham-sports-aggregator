const fs = require('fs');
const puppeteer = require('puppeteer');
const ical = require('node-ical');

// 1. TEAMS & SOURCES CONFIGURATION
const FOOTBALL_PAGES = [
  { squad: 'Melksham Town 1st', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-men-1st-team/' },
  { squad: 'Melksham Town Res', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-res/' },
  { squad: 'FOF FC', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/fof-mens-1st-xi/' },
  { squad: 'Melksham Ladies', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-ladies/' },
  { squad: 'Melksham Vets', sport: 'FOOTBALL', badgeClass: 'badge-football', url: 'https://melkshamnews.com/melksham-town-fc-vets/' }
];

const RUGBY_PAGES = [
  { squad: 'RFC Women', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-women-fixtures-2026-2027/' },
  { squad: 'RFC Men 1st XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-mens-1xv-fixtures-2026-2027/' },
  { squad: 'RFC Men 2nd XV', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-2xv-fixtures-2026-2027/' },
  { squad: 'U18s Academy', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-u18s-academy/' },
  { squad: 'Fawns U16', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u16/' },
  { squad: 'RFC 16s Bucks', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-rfc-16s-the-bucks/' },
  { squad: 'Fawns U14', sport: 'RUGBY', badgeClass: 'badge-rugby', url: 'https://melkshamnews.com/melksham-fawns-u14/' }
];

// Helper: Parse UK Dates (DD/MM/YYYY or DD/MM/YY)
function parseUkDate(str) {
  if (!str) return null;
  const match = str.trim().match(/\b(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{2,4})\b/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    let year = parseInt(match[3], 10);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  const d = new Date(str.trim());
  return isNaN(d.getTime()) ? null : d;
}

(async () => {
  // CALCULATE UK ACTIVE MONDAY-SUNDAY WINDOW
  const nowUK = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/London" }));
  const dayOfWeek = nowUK.getDay();
  const distanceToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);

  const mondayThisWeek = new Date(nowUK);
  mondayThisWeek.setDate(nowUK.getDate() + distanceToMonday);
  mondayThisWeek.setHours(0, 0, 0, 0);

  const sundayThisWeek = new Date(mondayThisWeek);
  sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
  sundayThisWeek.setHours(23, 59, 59, 999);

  console.log(`Active Window: ${mondayThisWeek.toDateString()} -> ${sundayThisWeek.toDateString()}`);

  const activeFixtures = [];

  // ==========================================
  // PHASE 1: RUGBY ICAL PROCESSING
  // ==========================================
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

  for (const info of RUGBY_PAGES) {
    try {
      console.log(`[Rugby] Extracting iCal for: ${info.squad}`);
      await page.goto(info.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Scan DOM specifically for direct .ics / ical links
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
        const events = await ical.async.fromURL(icalUrl);
        for (const key in events) {
          const ev = events[key];
          if (ev.type === 'VEVENT') {
            const summary = (ev.summary || '').trim();

            // STRICT EXCLUSION OF TRAINING & SOCIAL EVENTS
            if (/training|practice|session|meeting|social|duty|gym/i.test(summary)) {
              continue;
            }

            const evDate = new Date(ev.start);
            if (evDate >= mondayThisWeek && evDate <= sundayThisWeek) {
              activeFixtures.push({
                squad: info.squad,
                sport: info.sport,
                badgeClass: info.badgeClass,
                teams: summary.replace(/\s+[P|VMW]\b/gi, '').trim(),
                dateStr: evDate.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
                url: info.url
              });
            }
          }
        }
      }
    } catch (err) {
      console.error(`[Rugby Error] ${info.squad}:`, err.message);
    }
  }

  // ==========================================
  // PHASE 2: FOOTBALL DOM TABLE PARSING
  // ==========================================
  for (const info of FOOTBALL_PAGES) {
    try {
      console.log(`[Football] Parsing tables for: ${info.squad}`);
      await page.goto(info.url, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const parsedRows = await page.evaluate((squadInfo) => {
        const matches = [];
        const rows = Array.from(document.querySelectorAll('tr')).filter(r => !r.querySelector('th'));

        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td')).map(td => td.textContent.trim());
          const teamCell = cells.find(c => (c.toLowerCase().includes(' vs ') || c.toLowerCase().includes(' v ')) && c.length < 120);

          if (teamCell) {
            let cleanTeams = teamCell;
            let venueOrTime = '';

            // Split team names at structural boundary suffix
            const teamBoundaryRegex = /^(.+?\s+(?:VS|vs|v|V)\s+.+?(?:Res|Vets|Ladies|FC|XI|XV|Town|United|City))\s+(.*)$/i;
            const match = cleanTeams.match(teamBoundaryRegex);

            if (match) {
              cleanTeams = match[1].trim();
              venueOrTime = match[2].trim();
            }

            // Strip status codes
            cleanTeams = cleanTeams.replace(/\s+[P|VMW|P-P]\b/gi, '').trim();

            const dateCell = cells.find(c => /\b\d{1,2}[\/\.-]\d{1,2}[\/\.-]\d{2,4}\b/.test(c) || /\b(0?[1-9]|[12][0-9]|3[01])\b/.test(c) || /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)/i.test(c));

            matches.push({
              squad: squadInfo.squad,
              sport: squadInfo.sport,
              badgeClass: squadInfo.badgeClass,
              teams: cleanTeams,
              rawDate: (dateCell || venueOrTime || '').trim(),
              url: squadInfo.url
            });
          }
        }
        return matches;
      }, info);

      // Validate dates against Monday-Sunday range
      for (const item of parsedRows) {
        let isThisWeek = false;
        const parsedDate = parseUkDate(item.rawDate);

        if (parsedDate) {
          if (parsedDate >= mondayThisWeek && parsedDate <= sundayThisWeek) {
            isThisWeek = true;
          }
        } else {
          // Retain if fixture is explicitly listed in active weekly table
          isThisWeek = true;
        }

        if (isThisWeek) {
          activeFixtures.push({
            squad: item.squad,
            sport: item.sport,
            badgeClass: item.badgeClass,
            teams: item.teams,
            dateStr: item.rawDate || 'Kickoff details on team page',
            url: item.url
          });
        }
      }
    } catch (err) {
      console.error(`[Football Error] ${info.squad}:`, err.message);
    }
  }

  await browser.close();

  // Save Output
  fs.writeFileSync('fixtures.json', JSON.stringify(activeFixtures, null, 2));
  console.log(`Successfully compiled ${activeFixtures.length} clean fixtures into fixtures.json`);
})();

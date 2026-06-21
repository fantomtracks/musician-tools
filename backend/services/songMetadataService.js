const logger = require('../logger');
const cheerio = require('cheerio');
const fetch = require('node-fetch');

const SONGBPM_BASE = 'https://songbpm.com';

// Map scraped genres to standardized genre list
const GENRE_MAPPING = {
  // Rock variants
  'rock': 'Rock',
  'hard rock': 'Hard Rock',
  'alternative rock': 'Alternative',
  'alternative': 'Alternative',
  'indie': 'Indie',
  'punk': 'Punk',
  'progressive rock': 'Progressive',
  'progressive': 'Progressive',
  
  // Metal variants
  'metal': 'Metal',
  'funk metal': 'Metal',
  'alternative metal': 'Metal',
  'rap metal': 'Metal',
  'nu metal': 'Metal',
  'heavy metal': 'Metal',
  
  // Hip-Hop/Rap
  'rap': 'Rap',
  'hip-hop': 'Hip-Hop',
  'hip hop': 'Hip-Hop',
  'trap': 'Trap',
  
  // Electronic
  'electronic': 'Electronic',
  'edm': 'EDM',
  'techno': 'Techno',
  'house': 'House',
  'drum and bass': 'Drum & Bass',
  'drum & bass': 'Drum & Bass',
  'ambient': 'Ambient',
  'disco': 'Disco',
  
  // Other
  'pop': 'Pop',
  'folk': 'Folk',
  'funk': 'Funk',
  'jazz': 'Jazz',
  'blues': 'Blues',
  'country': 'Country',
  'reggae': 'Reggae',
  'ska': 'Ska',
  'classical': 'Classical',
  'gospel': 'Gospel',
  'r&b': 'R&B / Soul',
  'soul': 'R&B / Soul',
  'latin': 'Latin',
  'world': 'World',
  'acoustic': 'Acoustic',
  'soundtrack': 'Soundtrack',
  'k-pop': 'K-Pop',
  'kpop': 'K-Pop',
};

const normalizeGenres = (genres) => {
  if (!genres || !Array.isArray(genres)) return null;
  
  const mapped = genres
    .map(g => {
      const lower = g.toLowerCase().trim();
      // Direct match
      if (GENRE_MAPPING[lower]) return GENRE_MAPPING[lower];
      // Partial match (e.g., "protest rock" -> "Rock")
      for (const [key, value] of Object.entries(GENRE_MAPPING)) {
        if (lower.includes(key)) return value;
      }
      return null;
    })
    .filter(Boolean);
  
  // Remove duplicates and limit to 5
  return [...new Set(mapped)].slice(0, 5);
};

const normalizeKey = (key) => {
  if (!key || typeof key !== 'string') return null;
  const trimmed = key.trim();
  const allowed = ['C','C#','Db','D','D#','Eb','E','F','F#','Gb','G','G#','Ab','A','A#','Bb','B'];
  return allowed.includes(trimmed) ? trimmed : null;
};

const normalizeTimeSignature = (sig) => {
  if (!sig || typeof sig !== 'string') return null;
  const match = sig.match(/^(\d+)\/(\d+)$/);
  return match ? `${match[1]}/${match[2]}` : null;
};

const safeNumber = (val) => {
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
};

// Parse a "m:ss" or "h:mm:ss" duration string into total seconds. Returns null on anything
// unexpected, including out-of-range components (e.g. "3:90") so a malformed scrape is rejected.
const parseDurationToSeconds = (text) => {
  if (!text || typeof text !== 'string') return null;
  const parts = text.trim().split(':').map(p => p.trim());
  if (parts.length < 2 || parts.length > 3 || !parts.every(p => /^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  // Trailing components are sexagesimal: seconds < 60 always; minutes < 60 when hours are present.
  if (nums[nums.length - 1] >= 60) return null;
  if (nums.length === 3 && nums[1] >= 60) return null;
  const seconds = nums.length === 2
    ? nums[0] * 60 + nums[1]
    : nums[0] * 3600 + nums[1] * 60 + nums[2];
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
};

// Slugify artist/song name for SongBPM URL format
const slugify = (text) => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special chars
    .replace(/[\s_-]+/g, '-') // Replace spaces/underscores with single dash
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes
};

async function fetchFromSongBpm(query, title, artist) {
  try {
    // Build direct URL: /@artist-slug/song-slug
    const artistSlug = slugify(artist);
    const songSlug = slugify(title);
    const url = `${SONGBPM_BASE}/@${artistSlug}/${songSlug}`;
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; musician-tools/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    if (!res.ok) return null;
    
    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract BPM from metrics card (dt containing "Tempo (BPM)", then following dd)
    let bpm = null;
    $('dl dt').each((_, dt) => {
      const $dt = $(dt);
      if ($dt.text().includes('Tempo') || $dt.text().includes('BPM')) {
        const bpmText = $dt.next('dd').text().trim();
        bpm = safeNumber(bpmText);
      }
    });

    // Extract Key from metrics card
    let key = null;
    $('dl dt').each((_, dt) => {
      const $dt = $(dt);
      if ($dt.text().trim() === 'Key') {
        const keyText = $dt.next('dd').text().trim();
        key = normalizeKey(keyText);
      }
    });

    // Extract Mode from description text "with a G key and a major mode"
    let mode = null;
    const descText = $('.lg\\:prose-xl, .prose').text();
    const modeMatch = descText.match(/key and a\s+(\w+)\s+mode/i);
    if (modeMatch) {
      const modeLower = modeMatch[1].toLowerCase();
      if (modeLower === 'major') mode = 'Major';
      else if (modeLower === 'minor') mode = 'Minor';
    }

    // Extract Time Signature from description "with a time signature of 4 beats per bar"
    let timeSignature = null;
    const tsMatch = descText.match(/time signature of\s+(\d+)\s+beats per bar/i);
    if (tsMatch) {
      timeSignature = `${tsMatch[1]}/4`;
    }

    // Extract Duration from metrics card (same dl dt/dd card as BPM/Key), parse "m:ss"/"h:mm:ss"
    let durationSeconds = null;
    $('dl dt').each((_, dt) => {
      const $dt = $(dt);
      if ($dt.text().trim() === 'Duration') {
        const durText = $dt.next('dd').text().trim();
        durationSeconds = parseDurationToSeconds(durText);
      }
    });

    // Album not available on song page, leave null
    const album = null;

    // If we got at least BPM or key, consider it a valid result
    if (!bpm && !key) return null;

    return { bpm, key, mode, timeSignature, album, durationSeconds };
  } catch (err) {
    logger.warn(`SongBPM scraping failed: ${err.message}`);
    return null;
  }
}

async function fetchFromGenius(title, artist) {
  console.log('>>> GENIUS CALLED with:', { title, artist });
  try {
    // Scrape Genius track page for album and tags
    // Genius URL format: Artist-name-song-name-lyrics (capitalize first letter of each word)
    const artistSlug = artist
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const songSlug = title
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    // Capitalize first letter
    const artistCapitalized = artistSlug.charAt(0).toUpperCase() + artistSlug.slice(1);
    
    const url = `https://genius.com/${artistCapitalized}-${songSlug}-lyrics`;
    
    console.log('>>> GENIUS URL:', url);
    logger.debug(`Genius URL: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    console.log('>>> GENIUS fetch status:', res.status);
    
    if (!res.ok) {
      console.log('>>> GENIUS fetch failed');
      logger.debug(`Genius fetch failed: ${res.status}`);
      return null;
    }
    
    const html = await res.text();
    console.log('>>> GENIUS HTML length:', html.length);
    
    // Check if we got valid HTML (basic validation only)
    if (!html || html.length < 100) {
      console.log('>>> GENIUS invalid response (too short)');
      logger.debug(`Genius returned invalid response`);
      return null;
    }

    const $ = cheerio.load(html);

    let album = null;
    let genres = [];

    // Extract album from the song header
    // Look for link with href="#primary-album"
    const albumLink = $('a[href="#primary-album"]').first();
    console.log('=== GENIUS DEBUG ===');
    console.log('Found albumLink:', albumLink.length > 0);
    if (albumLink.length > 0) {
      console.log('Raw text:', albumLink.html());
      // Get text and clean thoroughly
      album = albumLink.text()
        .replace(/<!-- -->/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      console.log('After cleanup:', album);
      if (album && album.length > 2 && album.length < 100) {
        logger.debug(`Genius found album: "${album}"`);
      } else {
        console.log('Album rejected (length):', album?.length);
        album = null;
      }
    } else {
      console.log('No albumLink found with href="#primary-album"');
    }

    // Fallback: look for album link in /albums/ path
    if (!album) {
      const albumLinkAlt = $('a[href*="/albums/"]').first();
      console.log('Trying albumLinkAlt:', albumLinkAlt.length > 0);
      if (albumLinkAlt.length > 0) {
        album = albumLinkAlt.text()
          .replace(/\s+/g, ' ')
          .trim();
        if (album && album.length > 2 && album.length < 100) {
          logger.debug(`Genius found album (alt): "${album}"`);
        } else {
          album = null;
        }
      }
    }

    console.log('Final album:', album);
    console.log('===================');

    // Extract genres from tags
    $('a[href*="/tags/"]').each((_, link) => {
      const genre = $(link).text().trim();
      if (genre && genre.length < 30 && !genre.match(/\d{4}|favorites|seen|usa|in english/i)) {
        genres.push(genre.toLowerCase());
        logger.debug(`Genius found tag: ${genre}`);
      }
    });

    const uniqueGenres = [...new Set(genres)].slice(0, 5);
    logger.debug(`Genius genres count: ${uniqueGenres.length}`);

    return { album, genres: uniqueGenres.length > 0 ? uniqueGenres : null };
  } catch (err) {
    logger.warn(`Genius scraping failed: ${err.message}`);
    return null;
  }
}

async function fetchFromWikipedia(title, artist) {
  try {
    // Search Wikipedia for the song, then extract album and genres from album page
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${artist} ${title}`)}&format=json`;
    
    const searchRes = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; musician-tools/1.0)'
      }
    });
    
    if (!searchRes.ok) {
      logger.debug(`Wikipedia search failed: ${searchRes.status}`);
      return null;
    }
    
    let searchData;
    try {
      searchData = await searchRes.json();
    } catch (jsonErr) {
      logger.debug(`Wikipedia search JSON parse failed: ${jsonErr.message}`);
      return null;
    }

    if (!searchData.query?.search || searchData.query.search.length === 0) {
      logger.debug(`Wikipedia search returned no results for "${artist} ${title}"`);
      return null;
    }

    // Get first search result (likely the song page)
    const songTitle = searchData.query.search[0].title;
    logger.debug(`Wikipedia found song page: ${songTitle}`);
    const songUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(songTitle)}`;
    
    const songRes = await fetch(songUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; musician-tools/1.0)',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    if (!songRes.ok) {
      logger.debug(`Wikipedia song page fetch failed: ${songRes.status}`);
      return null;
    }
    
    const html = await songRes.text();
    const $ = cheerio.load(html);

    // Look for album link in infobox (ONLY the link text, no extra content)
    let album = null;
    const infobox = $('.infobox');
    logger.debug(`Wikipedia infobox count: ${infobox.length}`);
    if (infobox.length > 0) {
      infobox.find('tr').each((_, tr) => {
        const $tr = $(tr);
        const label = $tr.find('th').text().trim().toLowerCase();
        if (label.includes('album') && !album) {
          // Extract ONLY the link text from the first link
          const link = $tr.find('td a').first();
          if (link && link.length > 0) {
            // Get just the link text, which should be the album name
            album = link.text().trim();
            // Clean up: remove any "(disambiguation)" or similar suffixes
            album = album.replace(/\s*\(.*?\)\s*$/, '').trim();
            if (album && album.length > 2 && album.length < 100) {
              logger.debug(`Wikipedia found album from link: "${album}"`);
            } else {
              album = null;
            }
          }
        }
      });
    }

    if (!album) {
      logger.debug(`No album found in Wikipedia infobox, trying text fallback for "${artist} ${title}"`);
      // Fallback: look for "from the album [Album]" in the first paragraph
      const firstPara = $('p').first().text();
      const fromMatch = firstPara.match(/from\s+(?:the\s+)?album\s+["\']?([^"\'.\n,;]+)/i);
      if (fromMatch && fromMatch[1]) {
        album = fromMatch[1].trim();
        logger.debug(`Wikipedia found album from text: "${album}"`);
      }
    }

    // If we found an album, scrape its genres from Wikipedia
    let genres = [];
    if (album) {
      const albumUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(album)}`;
      try {
        logger.debug(`Fetching Wikipedia album page: ${albumUrl}`);
        const albumRes = await fetch(albumUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; musician-tools/1.0)',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
        
        if (albumRes.ok) {
          const albumHtml = await albumRes.text();
          const $album = cheerio.load(albumHtml);
          
          // Extract genres from infobox
          const albumInfobox = $album('.infobox');
          logger.debug(`Wikipedia album infobox count: ${albumInfobox.length}`);
          if (albumInfobox.length > 0) {
            albumInfobox.find('tr').each((_, tr) => {
              const $tr = $album(tr);
              const label = $tr.find('th').text().trim().toLowerCase();
              if (label.includes('genre')) {
                $tr.find('td a').each((_, link) => {
                  const genre = $album(link).text().trim();
                  if (genre && genre.length < 30) {
                    genres.push(genre);
                    logger.debug(`Wikipedia found genre: ${genre}`);
                  }
                });
                // Also check plain text in case no links
                if (genres.length === 0) {
                  const genreText = $tr.find('td').text().trim();
                  const genreItems = genreText.split(/[,\n]/).map(g => g.trim()).filter(g => g && g.length < 30 && g.length > 0);
                  genres.push(...genreItems);
                  if (genreItems.length > 0) {
                    logger.debug(`Wikipedia found genres from text: ${genreItems.join(', ')}`);
                  }
                }
              }
            });
          }
        }
      } catch (albumErr) {
        logger.debug(`Wikipedia album scraping failed: ${albumErr.message}`);
      }
    }

    return { album, genres: [...new Set(genres)] };
  } catch (err) {
    logger.warn(`Wikipedia scraping failed: ${err.message}`);
    return null;
  }
}

async function fetchFromLastFm(title, artist) {
  try {
    // Scrape Last.fm track page for tags (genres)
    const artistSlug = slugify(artist);
    const songSlug = slugify(title);
    const url = `https://www.last.fm/music/${artistSlug}/_/${songSlug}`;
    
    logger.debug(`Last.fm URL: ${url}`);
    
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    
    if (!res.ok) {
      logger.debug(`Last.fm fetch failed: ${res.status} for ${url}`);
      return null;
    }
    
    const html = await res.text();
    const $ = cheerio.load(html);

    // Extract genres/tags from page (multiple possible selectors)
    const genres = [];
    
    // Try: tags in links
    $('a[href*="/tag/"]').each((_, link) => {
      const genre = $(link).text().trim();
      if (genre && genre.length < 30 && !genre.match(/\d{4}|favorites|seen live|loved/i)) {
        genres.push(genre.toLowerCase());
        logger.debug(`Last.fm found tag: ${genre}`);
      }
    });

    // Try: tag spans or divs
    if (genres.length === 0) {
      $('[data-test-id*="tag"], .tag, .tags li').each((_, el) => {
        const genre = $(el).text().trim();
        if (genre && genre.length < 30 && !genre.match(/\d{4}|favorites|seen|loved/i)) {
          genres.push(genre.toLowerCase());
          logger.debug(`Last.fm found tag (alt): ${genre}`);
        }
      });
    }

    // Remove duplicates and limit to top 5
    const uniqueGenres = [...new Set(genres)].slice(0, 5);
    logger.debug(`Last.fm genres count: ${uniqueGenres.length}`);
    
    return { genres: uniqueGenres.length > 0 ? uniqueGenres : null };
  } catch (err) {
    logger.warn(`Last.fm scraping failed: ${err.message}`);
    return null;
  }
}

async function fetchSongMetadata({ title, artist }) {
  console.log('>>> fetchSongMetadata CALLED with:', { title, artist });
  
  if (!title || !artist) {
    console.log('>>> Missing title or artist, returning null');
    return {
      bpm: null,
      key: null,
      mode: null,
      timeSignature: null,
      album: null,
      genres: null,
      durationSeconds: null,
      source: 'none'
    };
  }

  const query = `${artist} ${title}`.trim();
  console.log('>>> Calling SongBPM...');
  const songBpm = await fetchFromSongBpm(query, title, artist);
  console.log('>>> SongBPM result:', songBpm);

  const bpm = songBpm?.bpm ?? null;
  const key = songBpm?.key ?? null;
  const mode = songBpm?.mode ?? null;
  const timeSignature = songBpm?.timeSignature ?? null;
  const durationSeconds = songBpm?.durationSeconds ?? null;

  // Try Genius first (better coverage for songs), then fallback to Wikipedia
  let album = null;
  let genres = null;
  let geniusResult = null;

  console.log('>>> Calling Genius...');
  geniusResult = await fetchFromGenius(title, artist);
  console.log('>>> Genius result:', geniusResult);
  
  if (geniusResult?.album) {
    album = geniusResult.album;
    console.log('>>> Using album from Genius:', album);
    logger.debug(`Using album from Genius`);
  }
  if (geniusResult?.genres && geniusResult.genres.length > 0) {
    genres = geniusResult.genres;
    console.log('>>> Using genres from Genius:', genres);
    logger.debug(`Using genres from Genius`);
  }

  // If Genius didn't have album, try Wikipedia
  if (!album) {
    console.log('>>> Genius had no album, calling Wikipedia...');
    const wikipedia = await fetchFromWikipedia(title, artist);
    console.log('>>> Wikipedia result:', wikipedia);
    if (wikipedia?.album) {
      album = wikipedia.album;
      logger.debug(`Using album from Wikipedia`);
    }
    // If Wikipedia has genres but Genius didn't, use Wikipedia genres
    if (!genres && wikipedia?.genres && wikipedia.genres.length > 0) {
      genres = wikipedia.genres;
      logger.debug(`Using genres from Wikipedia`);
    }
  }

  // If no genres found, try Last.fm
  if (!genres || genres.length === 0) {
    const lastfm = await fetchFromLastFm(title, artist);
    if (lastfm?.genres && lastfm.genres.length > 0) {
      genres = lastfm.genres;
      logger.debug(`Using genres from Last.fm track`);
    }
    
    // If still no genres, try artist page on Last.fm
    if (!genres || genres.length === 0) {
      try {
        const artistSlug = slugify(artist);
        const artistUrl = `https://www.last.fm/music/${artistSlug}`;
        const artistRes = await fetch(artistUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml'
          }
        });
        
        if (artistRes.ok) {
          const artistHtml = await artistRes.text();
          const $artist = cheerio.load(artistHtml);
          const artistGenres = [];
          
          $artist('a[href*="/tag/"]').each((_, link) => {
            const genre = $artist(link).text().trim();
            if (genre && genre.length < 30 && !genre.match(/\d{4}|favorites|seen|loved/i)) {
              artistGenres.push(genre.toLowerCase());
            }
          });
          
          if (artistGenres.length > 0) {
            genres = [...new Set(artistGenres)].slice(0, 5);
            logger.debug(`Using genres from Last.fm artist`);
          }
        }
      } catch (artistErr) {
        logger.debug(`Last.fm artist fallback failed: ${artistErr.message}`);
      }
    }
  }

  // Build source string (deduplicate)
  const sources = [];
  if (songBpm) sources.push('songbpm');
  if (geniusResult?.album || geniusResult?.genres) sources.push('genius');
  else if (album) sources.push('wikipedia');
  if (genres && !geniusResult?.genres) {
    sources.push('lastfm');
  }
  
  const source = [...new Set(sources)].join(', ') || 'none';

  // Normalize genres to match frontend list
  const normalizedGenres = normalizeGenres(genres);

  return {
    bpm,
    key,
    mode,
    timeSignature,
    album,
    genres: normalizedGenres,
    durationSeconds,
    source
  };
}

module.exports = { fetchSongMetadata };

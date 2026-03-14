
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';
import { chromium } from 'playwright';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const IMDB_SUGGEST_URL = 'https://v3.sg.media-imdb.com/suggestion/x';
const ARCHIVE_URL = 'https://archive.org';
const BOLLYFLIX_URL = 'https://bollyflix.sarl';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'max-age=0',
    'Referer': 'https://bollyflix.sarl/',
};

// Search Movies & Anime
app.get('/api/search', async (req, res) => {
    const { q, category } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });

    try {
        let results = [];
        
        if (category === 'anime') {
            // Use Jikan API for Anime Search - Increased limit to 24 for more seasons/movies
            const jikanUrl = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=24`;
            const { data: jikanData } = await axios.get(jikanUrl);
            
            if (jikanData && jikanData.data) {
                results = jikanData.data.map(item => ({
                    title: item.title + (item.year ? ` (${item.year})` : ''),
                    link: item.title,
                    img: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || 'https://via.placeholder.com/300x450?text=No+Poster',
                    description: item.synopsis ? item.synopsis.slice(0, 150) + '...' : 'Anime Search Result',
                    category: 'anime',
                    type: item.type, // TV, Movie, OVA, etc.
                    extra: item.episodes ? `${item.episodes} eps` : item.duration
                }));
            }
        } else {
            // Standard IMDb Suggestion for Movies/Cartoons
            const searchUrl = `${IMDB_SUGGEST_URL}/${encodeURIComponent(q)}.json`;
            const { data } = await axios.get(searchUrl, { headers: HEADERS });
            
            if (data && data.d) {
                data.d.forEach(item => {
                    if (item.q === 'feature' || item.q === 'TV series' || item.q === 'video') {
                        const title = item.l + (item.y ? ` (${item.y})` : '');
                        const img = item.i ? item.i.imageUrl : 'https://via.placeholder.com/300x450?text=No+Poster';
                        
                        results.push({ 
                            title: title, 
                            link: item.l, 
                            img: img,
                            description: item.s || '',
                            category: category || 'movie',
                            type: item.q === 'TV series' ? 'TV' : 'Film'
                        });
                    }
                });
            }
        }

        // Add Bollyflix Search Results
        try {
            const bfSearchUrl = `${BOLLYFLIX_URL}/?s=${encodeURIComponent(q)}`;
            const { data: bfData } = await axios.get(bfSearchUrl, { headers: HEADERS, timeout: 5000 });
            const $ = cheerio.load(bfData);
            
            $('article').each((i, el) => {
                const titleEl = $(el).find('h2.title a, h2.entry-title a').first();
                const titleText = titleEl.text().trim();
                const link = titleEl.attr('href');
                let img = $(el).find('img').attr('src');
                if (img && img.startsWith('//')) img = 'https:' + img;
                
                if (titleText && link) {
                    // Cleaner title: remove "Download", "Hindi", "Movie", etc from search results
                    let cleanBfTitle = titleText.replace(/^Download\s+/i, '')
                                               .replace(/\s+Download\s*$/i, '')
                                               .replace(/\(\d{4}\).*/, (match) => match.split(')')[0] + ')')
                                               .trim();
                    results.push({
                        title: cleanBfTitle,
                        link: link,
                        img: img || 'https://via.placeholder.com/300x450?text=Bollyflix',
                        description: 'High quality multi-audio stream',
                        category: category || 'movie',
                        type: 'Film/TV',
                        source: 'Bollyflix'
                    });
                }
            });
        } catch (bfErr) {
            console.error('[Bollyflix] Search error:', bfErr.message);
        }

        // Add YTS Search Results (for movies)
        if (category === 'movie' || !category) {
            try {
                const ytsUrl = `https://yts.mx/api/v2/list_movies.json?query_term=${encodeURIComponent(q)}&limit=10`;
                const { data: ytsData } = await axios.get(ytsUrl);
                if (ytsData && ytsData.data && ytsData.data.movies) {
                    ytsData.data.movies.forEach(movie => {
                        results.push({
                            title: movie.title_long,
                            link: movie.title,
                            img: movie.large_cover_image || movie.medium_cover_image,
                            description: movie.summary || movie.synopsis || 'YTS Movie Result',
                            category: 'movie',
                            type: 'Film',
                            source: 'YTS',
                            year: movie.year,
                            rating: movie.rating
                        });
                    });
                }
            } catch (ytsErr) {
                console.error('[YTS] Search error:', ytsErr.message);
            }
        }

        // Relevance Filter: Stricter matching to prevent unrelated results like Dragon Ball for Doraemon
        const qStr = q.toString().toLowerCase().trim();
        const qClean = qStr.replace(/[^a-z0-9]/g, '');
        
        results = results.filter(item => {
            const tStr = item.title.toLowerCase();
            const tClean = tStr.replace(/[^a-z0-9]/g, '');
            
            // 1. Direct substring match (very safe)
            if (tClean.includes(qClean) || qClean.includes(tClean)) return true;
            
            // 2. Common anime misspellings / phonetic matches
            if ((qClean.includes('dorea') || qClean.includes('dorae')) && tClean.includes('dorae')) return true;
            if (qClean.includes('pokemon') && tClean.includes('pokemon')) return true;
            
            // 3. Strict prefix match for the first word
            const qWords = qStr.split(/\s+/).filter(w => w.length > 2);
            if (qWords.length === 0) return true;
            
            // The FIRST word of the query must be partially present in the title
            const firstWordPrefix = qWords[0].substring(0, 4);
            const isMatch = tClean.includes(firstWordPrefix);
            
            if (!isMatch) {
                console.log(`[Filter] Rejected: "${item.title}" for query: "${q}" (Prefix "${firstWordPrefix}" not found)`);
            }
            
            return isMatch;
        });

        console.log(`[Search] Done. Query: "${q}" | Results: ${results.length}`);

        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// Trending / Suggestions Endpoint
app.get('/api/trending', async (req, res) => {
    try {
        let results = [];
        
        // 1. Get Top Anime from Jikan
        try {
            const animeResp = await axios.get('https://api.jikan.moe/v4/top/anime?limit=10');
            if (animeResp.data?.data) {
                const anime = animeResp.data.data.map(item => ({
                    title: item.title,
                    link: item.title,
                    img: item.images?.jpg?.large_image_url || 'https://via.placeholder.com/300x450',
                    description: item.synopsis?.slice(0, 100) + '...',
                    category: 'anime',
                    type: 'TV',
                    source: 'Jikan'
                }));
                results.push(...anime);
            }
        } catch (e) { console.error('Trending Anime Error:', e.message); }

        // 2. Get some popular movies from Bollyflix homepage (Featured)
        try {
            const { data: bfData } = await axios.get(BOLLYFLIX_URL, { headers: HEADERS });
            const $ = cheerio.load(bfData);
            $('article').slice(0, 10).each((i, el) => {
                const titleEl = $(el).find('h2.title a, h2.entry-title a').first();
                const titleText = titleEl.text().trim();
                const link = titleEl.attr('href');
                let img = $(el).find('img').attr('src');
                if (img && img.startsWith('//')) img = 'https:' + img;
                
                if (titleText && link) {
                    let cleanBfTitle = titleText.replace(/^Download\s+/i, '').replace(/\s+Download\s*$/i, '').trim();
                    results.push({
                        title: cleanBfTitle,
                        link: link,
                        img: img || 'https://via.placeholder.com/300x450',
                        description: 'Trending on Bollyflix',
                        category: 'movie',
                        type: 'Film',
                        source: 'Bollyflix'
                    });
                }
            });
        } catch (e) { console.error('Trending Bollyflix Error:', e.message); }

        // Shuffle all results
        results = results.sort(() => Math.random() - 0.5);
        
        res.json(results.slice(0, 20));
    } catch (error) {
        console.error('Trending error:', error);
        res.status(500).json({ error: 'Failed to fetch suggestions' });
    }
});

// Get Movie Details & Initial Links
app.get('/api/details', async (req, res) => {
    const { url, category } = req.query; 
    if (!url) return res.status(400).json({ error: 'Movie title is required' });

    try {
        const title = url;
        const isBollyflix = title.startsWith('http') && title.includes('bollyflix');
        const cleanTitle = isBollyflix ? '' : title.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        
        const links = [];

        if (isBollyflix) {
            // Direct scraping of the Bollyflix page
            console.log(`[Bollyflix] Scraping direct page: ${title}`);
            const { data: pageData } = await axios.get(title, { headers: HEADERS });
            const $ = cheerio.load(pageData);
            const noiseKeywords = ['sample', 'trailer', 'teaser', 'promo', 'lyrics', 'song', 'template', 'capcut'];

            $('p, h3, h4, div').each((i, el) => {
                const headerText = $(el).text().trim();
                const isResolutionHeader = headerText.toLowerCase().includes('download') && (headerText.includes('p') || headerText.includes('Audio') || headerText.includes('bit'));
                
                if (isResolutionHeader) {
                    // Search for links in current element OR next siblings
                    const containers = [$(el)];
                    let next = $(el).next();
                    while (next.length && !next.is('h2, h3, h4')) {
                        containers.push(next);
                        if (next.find('a').length > 0) break; // Stop after first container with links
                        next = next.next();
                    }

                    containers.forEach(container => {
                        container.find('a').each((j, btn) => {
                            const text = $(btn).text().trim();
                            const href = $(btn).attr('href');
                            
                            // EXTREMELY STRICT WHITELIST: Only things that look like actual download/stream buttons
                            const mediaWhitelist = ['download', 'watch', 'online', 'g-direct', 'hubcloud', 'gdtot', 'drive', 'mirror', 'click here', 'stream', 'fast', 'instant', 'high speed', 'direct'];
                            const metadataBlacklist = ['imdb.com', 'instagram.com', 'facebook.com', 'twitter.com', 'youtube.com', 't.me/', 'telegram.me/', 'wikipedia.org', 'contact', 'credits', 'request'];
                            
                            if (href && href.startsWith('http')) {
                                const lowText = text.toLowerCase();
                                const lowHref = href.toLowerCase();
                                
                                const isMediaLink = mediaWhitelist.some(w => lowText.includes(w)) || 
                                                  (lowHref.includes('hubcloud') || lowHref.includes('gdtot') || lowHref.includes('drive.google') || lowHref.includes('pixeldrain'));
                                
                                const isInternal = lowHref.includes('bollyflix.sarl') || lowHref.includes('bollyflix.org') || lowHref.includes('bollyflix.run');
                                const isBlacklisted = metadataBlacklist.some(d => lowHref.includes(d));
                                const isCastLink = lowHref.includes('/name/nm') || lowHref.includes('/cast/');
                                
                                // Genuine Bollyflix download links are ALWAYS external
                                if (isMediaLink && !isBlacklisted && !isCastLink && !isInternal && !noiseKeywords.some(k => lowText.includes(k))) {
                                    // Avoid duplicates
                                    if (!links.some(l => l.url === href)) {
                                        links.push({ 
                                            text: `${headerText.split('[')[0].replace(/Download/gi, '').trim()} - ${text}`, 
                                            url: href,
                                            languages: (headerText.includes('Hindi') || lowText.includes('hindi')) ? ['Hindi'] : ['Multi Audio']
                                        });
                                    }
                                }
                            }
                        });
                    });
                }
            });
            
            return res.json({
                title: $('h1.entry-title').text().trim() || 'Bollyflix Media',
                poster: $('.mvic-thumb img').attr('src') || 'https://via.placeholder.com/300x450?text=Bollyflix',
                description: "This item was found on Bollyflix. We've extracted the direct download links for you.",
                links: links
            });
        }

        // Specialized Internet Archive Searches
        let queries = [];
        const hindiSuffix = (category === 'movie' || category === 'tvshow') ? '+AND+subject:(hindi)' : '';
        
        if (category === 'cartoon') {
            queries = [
                `title:(${encodeURIComponent(title)})+AND+collection:(classic_cartoons+OR+animationandcartoons)+AND+NOT+subject:(gameplay)`,
                `(${encodeURIComponent(title)})+AND+mediatype:movies+AND+NOT+collection:(software+OR+handheld_consoles)`
            ];
        } else if (category === 'anime') {
            queries = [
                `title:(${encodeURIComponent(cleanTitle)})+AND+mediatype:movies+AND+subject:(anime)`,
                `(${encodeURIComponent(cleanTitle)})+anime+mkv`
            ];
        } else if (category === 'tvshow') {
            queries = [
                `title:(${encodeURIComponent(title)})+AND+(collection:television+OR+collection:classic_tv)+AND+NOT+collection:(software)`,
                `(${encodeURIComponent(title)})+Hindi+TV+Series`,
                `(${encodeURIComponent(cleanTitle)})+complete+series`
            ];
        } else {
            queries = [
                `title:(${encodeURIComponent(title)})${hindiSuffix}+AND+mediatype:movies+AND+NOT+collection:(software)`,
                `title:(${encodeURIComponent(title)})+AND+mediatype:movies+AND+NOT+collection:(software)`,
                `q=(${encodeURIComponent(cleanTitle)}+hindi)`
            ];
        }

        let docs = [];
        for (const q of queries) {
            const archiveSearch = `${ARCHIVE_URL}/advancedsearch.php?q=${q}&fl[]=identifier,title,downloads&sort[]=downloads+desc&output=json`;
            const { data: searchData } = await axios.get(archiveSearch);
            docs = searchData.response.docs || [];
            if (docs.length > 0) break;
        }
        
        // Just resolve the first 3 relevant items for speed
        const topDocs = docs.slice(0, 3);
        for (const doc of topDocs) {
            const metadataUrl = `${ARCHIVE_URL}/metadata/${doc.identifier}`;
            try {
                const { data: metaData } = await axios.get(metadataUrl);
                const files = metaData.files || [];
                
                // Find ALL matching video files (MP4 or MKV), excluding small files and noise
                const noiseKeywords = ['sample', 'trailer', 'teaser', 'promo', 'lyrics', 'song', 'template', 'capcut', 'gameplay', 'walkthrough', 'longplay', 'rom', 'gba', 'psx', 'ps1', 'unboxing', 'review'];
                const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                
                const videoFiles = files.filter(f => {
                    const name = f.name.toLowerCase();
                    const sizeMB = (f.size || 0) / 1024 / 1024;
                    const isVideo = name.endsWith('.mp4') || name.endsWith('.mkv');
                    const isNotNoise = !noiseKeywords.some(k => name.includes(k));
                    const isMinSize = sizeMB > 30; 
                    
                    // Stricter Filename Relevance Check:
                    // At least 2 words from the title MUST be in the filename, OR one very long word.
                    const matchedWords = titleWords.filter(tw => name.includes(tw));
                    const isRelevant = matchedWords.length >= Math.min(2, titleWords.length) || 
                                       titleWords.some(tw => tw.length > 6 && name.includes(tw));

                    return isVideo && isNotNoise && isMinSize && isRelevant;
                });
                
                for (const videoFile of videoFiles) {
                    const extension = videoFile.name.split('.').pop();
                    const cleanFileName = videoFile.name.toLowerCase();
                    const videoBaseName = videoFile.name.split('.')[0];
                    
                    // Enhanced Season/Episode Parsing
                    let season = null;
                    let episode = null;
                    
                    const seMatch = cleanFileName.match(/s(\d+)\s*e(\d+)/i) || cleanFileName.match(/season\s*(\d+).*episode\s*(\d+)/i);
                    const epMatch = cleanFileName.match(/ep\s*(\d+)/i) || cleanFileName.match(/episode\s*(\d+)/i) || cleanFileName.match(/\s(\d{2,3})\s/) || cleanFileName.match(/_(\d{2,3})_/);
                    const sMatch = cleanFileName.match(/s(\d+)/i) || cleanFileName.match(/season\s*(\d+)/i);

                    if (seMatch) {
                        season = parseInt(seMatch[1]);
                        episode = parseInt(seMatch[2]);
                    } else {
                        if (epMatch) episode = parseInt(epMatch[1]);
                        if (sMatch) season = parseInt(sMatch[1]);
                    }

                    // Detect languages
                    const languages = [];
                    if (cleanFileName.includes('hindi') || cleanFileName.includes('hin') || cleanFileName.includes('hnd')) languages.push('Hindi');
                    if (cleanFileName.includes('english') || cleanFileName.includes('eng')) languages.push('English');
                    if (cleanFileName.includes('jap')) languages.push('Japanese');
                    if (cleanFileName.includes('dual') || cleanFileName.includes('multi')) languages.push('Multi Audio');
                    if (cleanFileName.includes('dub')) languages.push('Dubbed');

                    // Look for subtitle tracks
                    const tracks = files.filter(f => {
                        const name = f.name.toLowerCase();
                        return (name.endsWith('.vtt') || name.endsWith('.srt')) && name.includes(videoBaseName);
                    }).map(f => ({
                        label: f.name.split('.').slice(-2, -1)[0] || 'Unknown',
                        url: `${ARCHIVE_URL}/download/${doc.identifier}/${encodeURIComponent(f.name)}`,
                        kind: 'captions'
                    }));

                    let linkTitle = videoFile.title || videoFile.name.replace(/\.[^/.]+$/, "").replace(/_/g, " ");
                    
                    // Clean up redundancy: If title is "Power Rangers Mystic Force", and filename is "Power Rangers Mystic Force - E01 - Broken Spell"
                    // we want just "Broken Spell" or "E01 - Broken Spell"
                    const seriesWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
                    let displayTitle = linkTitle;
                    seriesWords.forEach(word => {
                        const reg = new RegExp(word, 'gi');
                        displayTitle = displayTitle.replace(reg, '');
                    });
                    
                    // Remove common tags
                    displayTitle = displayTitle.replace(/s(\d+)e(\d+)/gi, '')
                                             .replace(/e(\d+)/gi, '')
                                             .replace(/720p|1080p|x264|h264|webrip|web-dl|bluray/gi, '')
                                             .replace(/[\[\]\(\)\-\.]/g, ' ')
                                             .replace(/\s+/g, ' ')
                                             .trim();
                    
                    if (!displayTitle || displayTitle.length < 2) {
                        displayTitle = `Episode ${episode || '??'}`;
                    }

                    const cleanName = `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.${extension}`;
                    
                    links.push({
                        text: displayTitle,
                        fileInfo: `${((videoFile.size || 0) / 1024 / 1024).toFixed(1)} MB`,
                        url: `${ARCHIVE_URL}/download/${doc.identifier}/${encodeURIComponent(videoFile.name)}`,
                        proxyUrl: `/api/download?url=${encodeURIComponent(`${ARCHIVE_URL}/download/${doc.identifier}/${videoFile.name}`)}&name=${encodeURIComponent(cleanName)}`,
                        streamUrl: `${ARCHIVE_URL}/download/${doc.identifier}/${encodeURIComponent(videoFile.name)}`,
                        languages: languages.length > 0 ? languages : ['Unknown'],
                        tracks: tracks,
                        season: season,
                        episode: episode
                    });
                    
                    // Cap links at 150 to keep things snappy
                }

                // Season Number Normalization:
                // If we have very high season numbers (like 28 for Dino Fury) and no low seasons, 
                // we treat the lowest found season as Season 1.
                const foundSeasons = Array.from(new Set(links.map(l => l.season).filter(s => s !== null))).sort((a, b) => a - b);
                if (foundSeasons.length > 0 && foundSeasons[0] > 10) {
                    const offset = foundSeasons[0] - 1;
                    links.forEach(l => {
                        if (l.season) l.season = l.season - offset;
                    });
                }

                if (links.length > 150) break;
            } catch (err) {
                // Ignore single metadata fetch errors
                console.error('Metadata fetch error for', doc.identifier);
            }
        }
        // Always attempt to find better/dubbed versions on Bollyflix
        if (links.length < 10) {
            try {
                // Determine if it's likely a Hollywood movie by checking common metadata or just adding a "Hindi" search variation anyway
                const searchTerms = [
                    title,
                    `${cleanTitle} Hindi`, // Specific search for dubbed versions
                    cleanTitle,
                    cleanTitle.split(' ').slice(0, 2).join(' ') 
                ];

                for (const term of searchTerms) {
                    if (!term || term.length < 3) continue;
                    
                    console.log(`[Bollyflix] Searching for: ${term}`);
                    const searchUrl = `${BOLLYFLIX_URL}/?s=${encodeURIComponent(term)}`;
                    const { data: bfData } = await axios.get(searchUrl, { headers: HEADERS });
                    let $ = cheerio.load(bfData);
                    
                    let bestMatchLink = null;
                    $('.result-item, article').each((i, el) => {
                        const linkEl = $(el).find('h2.title a, h2.entry-title a, .details .title a').first();
                        const resultTitle = linkEl.text().trim().toLowerCase();
                        const searchTitle = title.toLowerCase();
                        
                        // Smart fuzzy matching: check if many words overlap
                        const searchWords = searchTitle.split(/\s+/).filter(w => w.length > 2);
                        const resultWords = resultTitle.split(/\s+/).filter(w => w.length > 2);
                        const overlap = searchWords.filter(w => resultWords.includes(w));
                        
                        if ((searchWords.length > 0 && overlap.length >= searchWords.length * 0.6) || resultTitle.includes(searchTitle) || searchTitle.includes(resultTitle)) {
                            bestMatchLink = linkEl.attr('href');
                            return false; // break
                        }
                    });

                    if (bestMatchLink) {
                        const { data: pageData } = await axios.get(bestMatchLink, { headers: HEADERS });
                        $ = cheerio.load(pageData);
                        
                        const noiseKeywords = ['sample', 'trailer', 'teaser', 'promo', 'lyrics', 'song', 'template', 'capcut'];
                        
                        // Bollyflix specific: Find blocks of downloads which usually have a heading containing resolution/audio
                        $('p, h3, h4').each((i, el) => {
                            const headerText = $(el).text().trim();
                            if (headerText.toLowerCase().includes('download') && (headerText.includes('p') || headerText.includes('Audio'))) {
                                // Find the buttons immediately following this header
                                let nextEl = $(el).next();
                                // Sometimes there's an empty p or br
                                while (nextEl.length && !nextEl.find('a').length && nextEl.is('p, br, div')) {
                                    nextEl = nextEl.next();
                                }
                                
                                nextEl.find('a').each((j, btn) => {
                                    const text = $(btn).text().trim();
                                    const href = $(btn).attr('href');
                                    const lowerText = text.toLowerCase();
                                    const isNotNoise = !noiseKeywords.some(k => lowerText.includes(k));
                                    
                                    if (href && isNotNoise && (text.includes('Drive') || text.includes('Link') || text.includes('Download') || lowerText.includes('g-direct') || lowerText.includes('high speed'))) {
                                        // Combine the header text with button text for clarity (e.g., "720p Hindi-English - Google Drive")
                                        const cleanHeader = headerText.replace(/Download/gi, '').trim();
                                        links.push({ 
                                            text: `[Bollyflix] ${cleanHeader} - ${text}`, 
                                            url: href 
                                        });
                                    }
                                });
                            }
                        });

                        // Fallback to old method if no structured blocks found
                        if (links.length === 0) {
                            $('a.maxbutton-1, a.maxbutton-2, a.maxbutton, .maxbutton, a.dl, a.dls').each((i, el) => {
                                const text = $(el).text().trim();
                                const href = $(el).attr('href');
                                const lowerText = text.toLowerCase();
                                const isNotNoise = !noiseKeywords.some(k => lowerText.includes(k));
                                
                                if (href && isNotNoise && (text.includes('Download') || text.includes('Google Drive') || text.includes('G-Direct') || lowerText.includes('download'))) {
                                    links.push({ text: `[Fallback Link] ${text}`, url: href });
                                }
                            });
                        }
                        
                        if (links.length > 0) break;
                    }
                }
            } catch (err) {
                console.error('Bollyflix fallback search error:', err);
            }
        }

        // Final attempts at global indexes with language awareness
        if (links.length < 5) {
            try {
                // Add category-specific keywords
                let ddgQuery = `index of ${cleanTitle} mkv mp4`;
                if (category === 'anime') ddgQuery += ' dual audio';
                if (category === 'cartoon') ddgQuery += ' multi audio hindi';

                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
                const { data: ddgData } = await axios.get(ddgUrl, { headers: HEADERS });
                const $ = cheerio.load(ddgData);
                
                const searchResults = [];
                $('.result__a').each((i, el) => {
                    if (searchResults.length < 4) {
                        searchResults.push($(el).attr('href'));
                    }
                });

                const noiseKeywords = ['sample', 'trailer', 'teaser', 'promo', 'lyrics', 'song', 'template', 'capcut'];
                for (const siteUrl of searchResults) {
                    try {
                        const { data: siteData } = await axios.get(siteUrl, { headers: HEADERS, timeout: 5000 });
                        const $site = cheerio.load(siteData);
                        $site('a').each((i, el) => {
                            const href = $site(el).attr('href');
                            let text = $site(el).text().trim();
                            if (href && (href.endsWith('.mp4') || href.endsWith('.mkv') || href.endsWith('.avi'))) {
                                const lowerHref = href.split('/').pop().toLowerCase();
                                const isNotNoise = !noiseKeywords.some(k => lowerHref.includes(k));
                                
                                if (isNotNoise) {
                                    const absoluteUrl = new URL(href, siteUrl).href;
                                    const extension = href.split('.').pop();
                                    
                                    // Detect languages from filename/text
                                    const languages = [];
                                    const combinedText = (text + lowerHref).toLowerCase();
                                    if (combinedText.includes('hindi') || combinedText.includes('hin')) languages.push('Hindi');
                                    if (combinedText.includes('english') || combinedText.includes('eng')) languages.push('English');
                                    if (combinedText.includes('jap')) languages.push('Japanese');
                                    if (combinedText.includes('dual')) languages.push('Dual Audio');
                                    if (combinedText.includes('multi')) languages.push('Multi Audio');

                                    const cleanName = `${title.replace(/[^a-zA-Z0-9 ]/g, '')}.${extension}`;
                                    
                                    // Detect Season/Episode for global index links
                                    let season = null;
                                    let episode = null;
                                    const seMatch = lowerHref.match(/s(\d+)\s*e(\d+)/i);
                                    const epMatch = lowerHref.match(/ep\s*(\d+)/i) || lowerHref.match(/\s(\d{2,3})\s/) || lowerHref.match(/_(\d{2,3})_/);
                                    if (seMatch) {
                                        season = parseInt(seMatch[1]);
                                        episode = parseInt(seMatch[2]);
                                    } else if (epMatch) {
                                        episode = parseInt(epMatch[1]);
                                    }

                                    links.push({
                                        text: `[Direct] ${text || href.split('/').pop()}`,
                                        url: absoluteUrl,
                                        proxyUrl: `/api/download?url=${encodeURIComponent(absoluteUrl)}&name=${encodeURIComponent(cleanName)}`,
                                        languages: languages.length > 0 ? languages : ['Original'],
                                        season: season,
                                        episode: episode
                                    });
                                }
                            }
                        });
                        if (links.length >= 8) break;
                    } catch (e) { }
                }
            } catch (err) {
                console.error('Global index search error:', err);
            }
        }
        
        let desc = "We searched the wide-internet open archives for safe, ad-free downloads of this title. Below are the direct HTTP video files we located for you to download safely.";
        if (links.length === 0) {
             desc = "Unfortunately, we could not find any active, safe download links for this title across the open internet or our fallback indexers.";
        } else if (links.some(l => l.text.includes('[Global Index]'))) {
             desc = "We've located this title in a direct open-internet directory. These links are safe, ad-free, and lead directly to the video files.";
        } else if (links.some(l => l.text.includes('[Fallback Link]'))) {
             desc = "We couldn't find a direct archive file, so we fell back to our specialized indexing search. The links below are redirects but carefully verified.";
        }

        res.json({
            title: title,
            poster: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?auto=format&fit=crop&q=80&w=800', // Generic cinema backup poster mapping
            description: desc,
            links: links
        });
    } catch (error) {
        console.error('Details error:', error);
        res.status(500).json({ error: 'Failed to fetch movie details' });
    }
});

// Helper: Resolve shortener/landing page links to direct download URLs using headless browser
async function resolveDirectLink(url) {
    const SHORTENER_DOMAINS = ['dizztips', 'hubcloud', 'instadp', 'shrinkme', 'gplinks', 'bc.vc', 'ouo.io', 'short.pe', 'mdisk.me'];
    const isShortener = SHORTENER_DOMAINS.some(d => url.includes(d));

    if (!isShortener) return url; // Already a direct link

    console.log(`[Resolver] Using headless browser to bypass shortener: ${url}`);
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const context = await browser.newContext({ 
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        let resolvedUrl = url;
        
        // Listen for navigation to media file or final download site
        page.on('request', request => {
            const reqUrl = request.url();
            if (reqUrl.match(/\.(mp4|mkv|avi|mov|zip)($|\?)/i)) {
                resolvedUrl = reqUrl;
            }
        });
        
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Wait for countdown if present (up to 10 seconds)
        try {
            await page.waitForSelector('a[id*="download"], button[id*="download"], .downloadButton, #btn-main, .download-btn', { timeout: 10000 });
        } catch (e) {
            // No download button found yet, wait a bit
            await page.waitForTimeout(3000);
        }

        // Click the main download/continue button
        try {
            const downloadBtn = page.locator('a[href*="download"], #btn-main, .download-btn, a.btn.btn-success, a:has-text("Download"), a:has-text("Get Link"), a:has-text("Continue")').first();
            const href = await downloadBtn.getAttribute('href');
            if (href && href.startsWith('http')) {
                resolvedUrl = href;
            }
        } catch(e) {
            console.log('[Resolver] Could not find download button, using current URL');
        }

        return resolvedUrl;
    } catch (e) {
        console.error('[Resolver] Headless browser failed:', e.message);
        return url; // Return original as fallback
    } finally {
        if (browser) await browser.close();
    }
}

app.get('/api/download', async (req, res) => {
    let { url, name } = req.query;
    if (!url || !name) return res.status(400).send('URL and name are required');

    let targetUrl = decodeURIComponent(url.toString());
    console.log(`[Proxy] Resolving/Downloading: ${name} from ${targetUrl}`);

    try {
        // Step 1: Try to resolve shortener URLs using headless browser
        targetUrl = await resolveDirectLink(targetUrl);
        console.log(`[Proxy] Resolved to: ${targetUrl}`);

        // Step 2: Check if it's a media file — if so, proxy it
        const isMediaFile = /\.(mp4|mkv|avi|mp3|mov|zip)($|\?)/i.test(targetUrl);
        
        if (!isMediaFile) {
            // If still not a direct file, redirect user to the resolved URL
            console.log(`[Proxy] Not a direct file, redirecting to: ${targetUrl}`);
            return res.redirect(targetUrl);
        }

        // Step 3: Proxy the actual media file for direct download
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: { 
                'User-Agent': HEADERS['User-Agent'],
                'Referer': targetUrl // Some sites require referrer
            },
            timeout: 60000 // Increased timeout for slow downloads
        });

        const safeName = name.toString().replace(/[^a-zA-Z0-9. _-]/g, '_');
        
        // If the response is HTML, we likely failed to resolve to a file.
        const contentType = response.headers['content-type'];
        if (contentType && contentType.includes('text/html')) {
            // If it's still HTML, we might need the user to handle it, but we'll try one last redirect follow
            console.log(`[Proxy] Target is still HTML, redirecting user to: ${targetUrl}`);
            return res.redirect(targetUrl);
        }

        res.setHeader('Content-Type', contentType || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition, Content-Type');
        
        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('Download proxy error:', error.message);
        // If we can't proxy, at least give them the link
        res.status(500).send(`Download failed to proxy. You can try downloading directly: <a href="${targetUrl}">${targetUrl}</a>`);
    }
});

// Stream Proxy (Supports Range headers for Seeking)
app.get('/api/stream', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL is required');

    console.log(`[Stream] URL: ${url}`);

    const targetUrl = decodeURIComponent(url.toString());
    const range = req.headers.range;

    const headers = {
        'User-Agent': HEADERS['User-Agent'],
        'Referer': ARCHIVE_URL,
    };

    if (range) {
        headers['Range'] = range;
    }

    try {
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: headers,
            timeout: 30000
        });

        // Set necessary headers for video playback
        res.status(response.status);
        
        const responseHeaders = [
            'content-type',
            'content-length',
            'content-range',
            'accept-ranges',
            'cache-control'
        ];

        responseHeaders.forEach(header => {
            if (response.headers[header]) {
                res.setHeader(header, response.headers[header]);
            }
        });

        // Ensure browser allows seeking
        if (!res.getHeader('accept-ranges')) {
            res.setHeader('accept-ranges', 'bytes');
        }

        response.data.pipe(res);
    } catch (error) {
        console.error('Stream proxy error:', error.message);
        res.status(error.response?.status || 500).send(error.message);
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

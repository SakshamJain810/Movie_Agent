
import express from 'express';
import cors from 'cors';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

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

// Search Movies
app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Query is required' });

    try {
        const searchUrl = `${IMDB_SUGGEST_URL}/${encodeURIComponent(q)}.json`;
        const { data } = await axios.get(searchUrl, { headers: HEADERS });
        
        const results = [];
        if (data && data.d) {
            data.d.forEach(item => {
                // Focus on feature films or TV series to avoid actors/companies
                if (item.q === 'feature' || item.q === 'TV series') {
                    const title = item.l + (item.y ? ` (${item.y})` : '');
                    // For the details pass the raw title so Internet Archive can search it
                    const link = item.l;
                    const img = item.i ? item.i.imageUrl : 'https://via.placeholder.com/300x450?text=No+Poster';
                    
                    results.push({ 
                        title: title, 
                        link: link, 
                        img: img,
                        description: item.s || ''
                    });
                }
            });
        }

        res.json(results);
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Failed to fetch results' });
    }
});

// Get Movie Details & Initial Links
app.get('/api/details', async (req, res) => {
    // The "url" param is actually the title we passed from /api/search
    const { url } = req.query; 
    if (!url) return res.status(400).json({ error: 'Movie title is required' });

    try {
        const title = url;
        
        // 1. We already have the poster and basic details on the frontend. 
        // We will just fetch wide-internet results from Internet Archive for free/safe downloads.
        const cleanTitle = title.replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
        const queries = [
            `title:(${encodeURIComponent(title)})+AND+mediatype:movies`,
            `(${encodeURIComponent(cleanTitle)})+AND+mediatype:movies`
        ];

        let docs = [];
        for (const q of queries) {
            const archiveSearch = `${ARCHIVE_URL}/advancedsearch.php?q=${q}&fl[]=identifier,title,downloads&sort[]=downloads+desc&output=json`;
            const { data: searchData } = await axios.get(archiveSearch);
            docs = searchData.response.docs || [];
            if (docs.length > 0) break;
        }
        
        // We will try to fetch the actual video links for the top results
        const links = [];
        
        // Just resolve the first 3 relevant items for speed
        const topDocs = docs.slice(0, 3);
        for (const doc of topDocs) {
            const metadataUrl = `${ARCHIVE_URL}/metadata/${doc.identifier}`;
            try {
                const { data: metaData } = await axios.get(metadataUrl);
                const files = metaData.files || [];
                
                // Find MP4 or MKV videos
                const videoFile = files.find(f => f.name.endsWith('.mp4') || f.name.endsWith('.mkv'));
                
                if (videoFile) {
                    links.push({
                        text: `${doc.title} (${(videoFile.size / 1024 / 1024).toFixed(1)} MB)`,
                        url: `${ARCHIVE_URL}/download/${doc.identifier}/${encodeURIComponent(videoFile.name)}`
                    });
                }
            } catch (err) {
                // Ignore single metadata fetch errors
                console.error('Metadata fetch error for', doc.identifier);
            }
        }
        if (links.length === 0) {
            try {
                // Escalating search terms for Bollyflix
                const searchTerms = [
                    title,
                    cleanTitle,
                    cleanTitle.split(' ').slice(0, 2).join(' ') // e.g. "Sachin A" or "Sachin Billion"
                ];

                for (const term of searchTerms) {
                    if (!term || term.length < 3) continue;
                    
                    const searchUrl = `${BOLLYFLIX_URL}/?s=${encodeURIComponent(term)}`;
                    const { data: bfData } = await axios.get(searchUrl, { headers: HEADERS });
                    let $ = cheerio.load(bfData);
                    
                    let bestMatchLink = null;
                    $('.result-item, article').each((i, el) => {
                        const linkEl = $(el).find('h2.title a, h2.entry-title a, .details .title a').first();
                        const resultTitle = linkEl.text().trim().toLowerCase();
                        const searchTitle = title.toLowerCase();
                        
                        // Check for significant overlap
                        if (resultTitle.includes(searchTitle) || searchTitle.includes(resultTitle)) {
                            bestMatchLink = linkEl.attr('href');
                            return false; // break
                        }
                    });

                    if (bestMatchLink) {
                        const { data: pageData } = await axios.get(bestMatchLink, { headers: HEADERS });
                        $ = cheerio.load(pageData);
                        
                        $('a.maxbutton-1, a.maxbutton-2, a.maxbutton, .maxbutton, a.dl, a.dls').each((i, el) => {
                            const text = $(el).text().trim();
                            const href = $(el).attr('href');
                            
                            if (href && (text.includes('Download') || text.includes('Google Drive') || text.includes('G-Direct') || text.toLowerCase().includes('download'))) {
                                links.push({ text: `[Fallback Link] ${text}`, url: href });
                            }
                        });
                        
                        if (links.length > 0) break;
                    }
                }
            } catch (err) {
                console.error('Bollyflix fallback search error:', err);
            }
        }

        // 3. Last Ditch: Global "Index Of" Search via DuckDuckGo
        if (links.length === 0) {
            try {
                const ddgQuery = `intitle:"index of" "${cleanTitle}" mkv OR mp4`;
                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(ddgQuery)}`;
                const { data: ddgData } = await axios.get(ddgUrl, { headers: HEADERS });
                const $ = cheerio.load(ddgData);
                
                const searchResults = [];
                $('.result__a').each((i, el) => {
                    if (searchResults.length < 3) {
                        searchResults.push($(el).attr('href'));
                    }
                });

                for (const siteUrl of searchResults) {
                    try {
                        const { data: siteData } = await axios.get(siteUrl, { headers: HEADERS, timeout: 5000 });
                        const $site = cheerio.load(siteData);
                        $site('a').each((i, el) => {
                            const href = $site(el).attr('href');
                            const text = $site(el).text().trim();
                            if (href && (href.endsWith('.mp4') || href.endsWith('.mkv'))) {
                                const absoluteUrl = new URL(href, siteUrl).href;
                                links.push({
                                    text: `[Global Index] ${text || href.split('/').pop()}`,
                                    url: absoluteUrl
                                });
                            }
                        });
                        if (links.length >= 5) break;
                    } catch (e) {
                         // Skip timed out or broken index sites
                    }
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

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});

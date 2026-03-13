import axios from 'axios';
import * as cheerio from 'cheerio';

const url = 'https://bollyflix.sarl/?s=' + encodeURIComponent('Sachin A Billion Dreams');

axios.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    }
}).then(async r => {
    let $ = cheerio.load(r.data);
    const firstResultLink = $('.result-item, article').first().find('h2.title a, h2.entry-title a, .details .title a').first().attr('href');
    console.log("Found detail URL:", firstResultLink);
    
    if (firstResultLink) {
        const { data: pageData } = await axios.get(firstResultLink, {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        $ = cheerio.load(pageData);
        const links = [];
        $('a.maxbutton-1, a.maxbutton-2, a.maxbutton, .maxbutton, a.dl, a.dls').each((i, el) => {
            const text = $(el).text().trim();
            const href = $(el).attr('href');
            console.log("Testing text:", text, "href:", href);
            if (href && (text.includes('Download') || text.includes('Google Drive') || text.includes('G-Direct') || text.toLowerCase().includes('download'))) {
                links.push({ text, url: href });
            }
        });
        console.log("Found links:", links);
    }
}).catch(console.error);

import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://html.duckduckgo.com/html/?q=intitle:%22index+of%22+(mp4|mkv)+%22Inception%22', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    }
}).then(res => {
    const $ = cheerio.load(res.data);
    $('.result__url').each((i, el) => {
        console.log($(el).text().trim());
    });
}).catch(console.error);

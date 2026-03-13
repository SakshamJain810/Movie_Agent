import axios from 'axios';
import * as cheerio from 'cheerio';

axios.post('https://lite.duckduckgo.com/lite/', 'q=intitle:%22index+of%22+%22Inception%22+mkv+OR+mp4', {
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
}).then(res => {
    const $ = cheerio.load(res.data);
    $('.result-url').each((i, el) => {
        console.log($(el).attr('href'));
    });
}).catch(console.error);

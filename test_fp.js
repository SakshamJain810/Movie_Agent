import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://filepursuit.com/pursuit?q=Inception+type%3Avideo', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
}).then(res => {
    const $ = cheerio.load(res.data);
    $('.file-link').each((i, el) => {
        console.log($(el).attr('href'));
    });
}).catch(console.error);

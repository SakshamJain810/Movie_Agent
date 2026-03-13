import axios from 'axios';
import * as cheerio from 'cheerio';

axios.get('https://www.bing.com/search?q=intitle:%22index+of%22+%22Inception%22+(mkv|mp4|avi)', {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    }
}).then(res => {
    const $ = cheerio.load(res.data);
    $('.b_algo h2 a').each((i, el) => {
        console.log($(el).attr('href'));
        console.log($(el).text());
    });
}).catch(console.error);

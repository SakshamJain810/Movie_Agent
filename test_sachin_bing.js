import axios from 'axios';
import * as cheerio from 'cheerio';

const query = 'intitle:"index of" "Sachin A Billion Dreams" mkv OR mp4';
const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}`;

axios.get(url, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    }
}).then(res => {
    const $ = cheerio.load(res.data);
    $('.b_algo h2 a').each((i, el) => {
        const title = $(el).text();
        const href = $(el).attr('href');
        console.log("Title:", title, "URL:", href);
    });
}).catch(console.error);

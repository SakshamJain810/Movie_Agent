import axios from 'axios';

axios.get('https://yts.mx/api/v2/list_movies.json?query_term=Inception').then(res => {
    const data = res.data;
    if (data.data.movies) {
        data.data.movies.forEach(item => {
            console.log(item.title, item.torrents[0].url);
        });
    } else {
        console.log("No movies found.");
    }
}).catch(console.error);
